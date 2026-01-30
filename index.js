/**
 * iMessage Legacy Channel Plugin for OpenClaw
 * Uses SQLite polling + AppleScript sending + proper dispatch system
 */

import Database from "better-sqlite3";
import { exec } from "child_process";
import { promisify } from "util";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

const execAsync = promisify(exec);
let pluginRuntime = null;

function normalizePhone(phone) {
  if (!phone) return null;
  let n = phone.replace(/[^\d+]/g, "");
  if (n.startsWith("+")) return n;
  if (n.length === 10) return "+1" + n;
  if (n.length === 11 && n.startsWith("1")) return "+" + n;
  return "+" + n;
}

function isAllowed(sender, allowFrom) {
  if (!sender || allowFrom.length === 0) return false;
  if (allowFrom.includes("*")) return true;
  const ns = normalizePhone(sender);
  for (const a of allowFrom) {
    if (a === sender || (ns && normalizePhone(a) === ns)) return true;
  }
  return false;
}

async function sendIMessage(recipient, text, log) {
  // Escape for AppleScript - but preserve actual newlines
  const escaped = text
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\r/g, "");  // Remove carriage returns, keep \n as actual newlines
  
  const script = `tell application "Messages" to send "${escaped}" to buddy "${recipient}" of (service 1 whose service type is iMessage)`;
  try {
    await execAsync(`osascript -e '${script.replace(/'/g, "'\"'\"'")}'`);
    log?.info?.(`[iMessage] Sent to ${recipient}`);
    return true;
  } catch (err) {
    log?.error?.(`[iMessage] Send failed: ${err.message}`);
    return false;
  }
}

const channel = {
  id: "imessage-legacy",
  meta: { id: "imessage-legacy", label: "iMessage Local", blurb: "SQLite + AppleScript", aliases: [] },
  capabilities: { chatTypes: ["direct", "group"], media: false },
  reload: { configPrefixes: ["channels.imessage-legacy"] },
  
  config: {
    listAccountIds: (cfg) => cfg.channels?.["imessage-legacy"]?.enabled ? ["default"] : [],
    resolveAccount: (cfg, accountId = "default") => {
      const c = cfg.channels?.["imessage-legacy"] ?? {};
      return { accountId, enabled: c.enabled ?? false, configured: Boolean(c.enabled),
        config: { pollIntervalMs: c.pollIntervalMs ?? 1000, dmPolicy: c.dmPolicy ?? "allowlist", allowFrom: c.allowFrom ?? [] }
      };
    },
    defaultAccountId: () => "default",
    resolveAllowFrom: ({ cfg }) => cfg.channels?.["imessage-legacy"]?.allowFrom ?? [],
  },
  
  security: { resolveDmPolicy: ({ account }) => ({ policy: account.config.dmPolicy ?? "allowlist", allowFrom: account.config.allowFrom ?? [] }) },
  messaging: { normalizeTarget: (t) => normalizePhone(t) || t },
  
  outbound: {
    deliveryMode: "direct",
    textChunkLimit: 4000,
    sendText: async ({ to, text, log }) => {
      const success = await sendIMessage(to, text, log);
      return success ? { ok: true, channel: "imessage-legacy" } : { ok: false, error: "Send failed" };
    },
    sendMedia: async ({ to, text, mediaUrl, log }) => {
      const fullText = mediaUrl ? `${text || ''}\n[Media: ${mediaUrl}]`.trim() : text;
      const success = await sendIMessage(to, fullText, log);
      return success ? { ok: true, channel: "imessage-legacy" } : { ok: false, error: "Send failed" };
    }
  },
  
  gateway: {
    startAccount: async (ctx) => {
      const { account, cfg, abortSignal, log } = ctx;
      const pollMs = account.config.pollIntervalMs ?? 1000;
      const allowFrom = (account.config.allowFrom ?? []).map(s => normalizePhone(s) || s);
      
      log?.info(`[iMessage] Starting poll=${pollMs}ms allow=${allowFrom.length}`);
      
      // Get dispatch functions from pluginRuntime (set during register)
      const finalizeInboundContext = pluginRuntime?.channel?.reply?.finalizeInboundContext;
      const dispatchReplyFromConfig = pluginRuntime?.channel?.reply?.dispatchReplyFromConfig;
      const createReplyDispatcherWithTyping = pluginRuntime?.channel?.reply?.createReplyDispatcherWithTyping;
      
      log?.info(`[iMessage] Dispatch available: finalize=${!!finalizeInboundContext} dispatch=${!!dispatchReplyFromConfig} createDispatcher=${!!createReplyDispatcherWithTyping}`);
      
      if (!finalizeInboundContext || !dispatchReplyFromConfig || !createReplyDispatcherWithTyping) {
        log?.error("[iMessage] Missing dispatch functions from runtime");
        return () => {};
      }
      
      const dbPath = path.join(os.homedir(), "Library/Messages/chat.db");
      const statePath = path.join(os.homedir(), ".openclaw/imessage-legacy-state.json");
      
      let db;
      try {
        db = new Database(dbPath, { readonly: true, fileMustExist: true });
      } catch (err) {
        log?.error(`[iMessage] Cannot open database: ${err.message}`);
        return () => {};
      }
      
      let state = { lastRowId: 0, processedIds: [] };
      try { if (fs.existsSync(statePath)) state = JSON.parse(fs.readFileSync(statePath, "utf8")); } catch {}
      if (!state.processedIds) state.processedIds = [];
      if (!state.lastRowId) {
        state.lastRowId = db.prepare("SELECT MAX(ROWID) as m FROM message").get()?.m ?? 0;
        log?.info(`[iMessage] Init rowId=${state.lastRowId}`);
      }
      
      let running = true;
      abortSignal?.addEventListener("abort", () => { running = false; });
      
      async function poll() {
        if (!running) return;
        
        try {
          const maxId = db.prepare("SELECT MAX(ROWID) as m FROM message").get()?.m ?? 0;
          
          if (maxId > state.lastRowId) {
            const msgs = db.prepare(`
              SELECT m.ROWID, m.text, m.is_from_me, h.id as sender, c.chat_identifier, c.style
              FROM message m LEFT JOIN handle h ON m.handle_id = h.ROWID
              LEFT JOIN chat_message_join cmj ON m.ROWID = cmj.message_id
              LEFT JOIN chat c ON cmj.chat_id = c.ROWID
              WHERE m.ROWID > ? AND m.is_from_me = 0 ORDER BY m.ROWID LIMIT 20
            `).all(state.lastRowId);
            
            for (const msg of msgs) {
              state.lastRowId = Math.max(state.lastRowId, msg.ROWID);
              if (!msg.text?.trim() || !msg.sender) continue;
              if (!isAllowed(msg.sender, allowFrom)) continue;
              
              // Dedupe - skip if already processed
              if (state.processedIds.includes(msg.ROWID)) continue;
              state.processedIds.push(msg.ROWID);
              // Keep only last 100 processed IDs
              if (state.processedIds.length > 100) state.processedIds = state.processedIds.slice(-100);
              
              const isGroup = msg.style === 43 || msg.chat_identifier?.startsWith("chat");
              const chatId = isGroup ? msg.chat_identifier : msg.sender;
              
              log?.info(`[iMessage] From ${msg.sender}: "${msg.text.slice(0, 50)}"`);
              
              try {
                // Build session key - DMs share main, groups isolated
                const sessionKey = isGroup 
                  ? `agent:main:imessage-legacy:group:${chatId}`
                  : `agent:main:main`;
                
                log?.info(`[iMessage] Building context: Body="${msg.text}", SessionKey=${sessionKey}`);
                
                // Create inbound context with proper field names
                const inboundCtx = finalizeInboundContext({
                  Body: msg.text,
                  RawBody: msg.text,
                  CommandBody: msg.text,
                  BodyForAgent: msg.text,
                  BodyForCommands: msg.text,
                  From: isGroup ? `imessage-legacy:group:${chatId}` : `imessage-legacy:${msg.sender}`,
                  To: msg.sender,
                  SessionKey: sessionKey,
                  AccountId: account.accountId,
                  ChatType: isGroup ? "group" : "direct",
                  ConversationLabel: msg.sender,
                  SenderName: msg.sender,
                  SenderId: msg.sender,
                  Provider: "imessage-legacy",
                  Surface: "imessage-legacy",
                  MessageSid: `imsg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                  Timestamp: Date.now(),
                  CommandAuthorized: true,
                  OriginatingChannel: "imessage-legacy",
                  OriginatingTo: msg.sender,
                });
                
                log?.info(`[iMessage] Context created: Body="${inboundCtx.Body}", BodyForAgent="${inboundCtx.BodyForAgent}"`);
                
                // Create dispatcher with delivery callback
                const { dispatcher, replyOptions, markDispatchIdle } = createReplyDispatcherWithTyping({
                  deliver: async (payload, { kind }) => {
                    if (payload?.text) {
                      log?.info(`[iMessage] Delivering ${kind}: "${payload.text.slice(0, 50)}"`);
                      await sendIMessage(chatId, payload.text, log);
                    }
                  },
                  onError: (err) => {
                    log?.error(`[iMessage] Dispatch delivery error: ${err.message}`);
                  }
                });
                
                log?.info(`[iMessage] Dispatching to agent...`);
                
                // Dispatch to agent
                await dispatchReplyFromConfig({
                  ctx: inboundCtx,
                  cfg,
                  dispatcher,
                  replyOptions
                });
                
                markDispatchIdle();
                log?.info(`[iMessage] Dispatch complete`);
                
              } catch (err) {
                log?.error(`[iMessage] Dispatch error: ${err.stack || err.message}`);
              }
            }
            
            fs.writeFileSync(statePath, JSON.stringify(state, null, 2));
          }
        } catch (err) {
          log?.error(`[iMessage] Poll error: ${err.message}`);
        }
        
        if (running) setTimeout(poll, pollMs);
      }
      
      poll();
      return () => { running = false; try { db.close(); } catch {} log?.info("[iMessage] Stopped"); };
    }
  }
};

export default {
  id: "imessage-legacy",
  name: "iMessage Legacy",
  register(api) {
    // Store runtime - this has the dispatch functions we need
    pluginRuntime = api.runtime;
    api.registerChannel({ plugin: channel });
    api.logger.info("[iMessage Legacy] Registered");
  }
};
