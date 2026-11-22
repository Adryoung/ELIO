
/* ==========================================
   ELIO AI ASSISTANT
   AI Chat + History + Smart Planner
   Study Hub Assignment + Study Schedule
   Supabase + OpenRouter Edge Function
========================================== */

(() => {
  "use strict";

  const $ = id => document.getElementById(id);

  const form = $("chat-form");
  const input = $("chat-input");
  const sendButton = $("send-button");
  const newChatButton = $("new-chat");
  const messagesArea = $("chat-messages");
  const counter = $("character-count");
  const status = $("chat-status");
  const conversationList = $("conversation-list");
  const conversationCount = $("conversation-count");

  const CHAT_TABLE = "ai_chat_history";
  const CONVERSATION_TABLE = "ai_conversations";
  const FUNCTION_NAME = "dynamic-service";
  const STORAGE_KEY = "elio_ai_active_conversation";

  let currentUser = null;
  let currentConversationId = null;
  let history = [];
  let busy = false;
  let pending = null;

  if (
    !form || !input || !messagesArea ||
    !conversationList || !newChatButton
  ) {
    console.error("ELIO AI: Missing HTML elements.");
    return;
  }

  /* ==========================================
     UI HELPERS
  ========================================== */

  function setStatus(message) {
    if (status) status.textContent = message;
  }

  function updateCounter() {
    if (counter) {
      counter.textContent =
        `${input.value.length} / 2000`;
    }
  }

  function setBusy(value) {
    busy = value;

    input.disabled = value;
    newChatButton.disabled = value;

    if (sendButton) {
      sendButton.disabled = value;
      sendButton.textContent = value
        ? "Thinking..."
        : "Send Message →";
    }

    document.querySelectorAll(
      ".elio-ai-action, .conversation-open-button, .delete-chat-button"
    ).forEach(button => {
      button.disabled = value;
    });
  }

  function addMessage(role, content) {
    const welcome = messagesArea.querySelector(
      ".welcome-message"
    );

    if (welcome) welcome.remove();

    const element = document.createElement("div");
    element.className = `message ${role}`;
    element.textContent = content;

    messagesArea.appendChild(element);
    messagesArea.scrollTop = messagesArea.scrollHeight;

    return element;
  }

  function showWelcome() {
    messagesArea.replaceChildren();

    const wrapper = document.createElement("div");
    wrapper.className = "welcome-message";

    const heading = document.createElement("h3");
    heading.textContent = "✨ Hello! I'm ELIO AI.";

    const paragraph = document.createElement("p");
    paragraph.textContent =
      "How can I help you today? You can chat in Bahasa Melayu or English.";

    wrapper.append(heading, paragraph);
    messagesArea.appendChild(wrapper);
  }

  function clearPreview() {
    pending = null;

    messagesArea.querySelectorAll(
      ".elio-ai-actions"
    ).forEach(element => element.remove());
  }

  function remember(role, content) {
    history.push({ role, content });
    history = history.slice(-10);
  }

  function savedConversationKey() {
    return `${STORAGE_KEY}_${currentUser.id}`;
  }

  function saveActiveConversation(id) {
    try {
      if (id) {
        localStorage.setItem(
          savedConversationKey(), id
        );
      } else {
        localStorage.removeItem(
          savedConversationKey()
        );
      }
    } catch (error) {
      console.warn("Local storage unavailable.", error);
    }
  }

  function getActiveConversation() {
    try {
      return localStorage.getItem(
        savedConversationKey()
      );
    } catch {
      return null;
    }
  }

  /* ==========================================
     DATE HELPERS
  ========================================== */

  function malaysiaToday() {
    const parts = new Intl.DateTimeFormat(
      "en-GB",
      {
        timeZone: "Asia/Kuala_Lumpur",
        year: "numeric",
        month: "2-digit",
        day: "2-digit"
      }
    ).formatToParts(new Date());

    const value = name =>
      parts.find(part => part.type === name)?.value;

    return [
      value("year"),
      value("month"),
      value("day")
    ].join("-");
  }

  function validDate(value) {
    if (
      typeof value !== "string" ||
      !/^\d{4}-\d{2}-\d{2}$/.test(value)
    ) return false;

    const [year, month, day] =
      value.split("-").map(Number);

    const date = new Date(
      Date.UTC(year, month - 1, day)
    );

    return (
      date.getUTCFullYear() === year &&
      date.getUTCMonth() === month - 1 &&
      date.getUTCDate() === day
    );
  }

  function validDateTime(value) {
    if (typeof value !== "string") return false;

    const pattern =
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

    return (
      pattern.test(value) &&
      Number.isFinite(Date.parse(value))
    );
  }

  function formatDate(value) {
    if (!value) return "";

    return new Date(value).toLocaleDateString(
      "en-MY",
      {
        day: "numeric",
        month: "short",
        year: "numeric"
      }
    );
  }

  function formatLocalDate(value) {
    if (!validDate(value)) return value;

    return new Date(
      `${value}T00:00:00Z`
    ).toLocaleDateString(
      "en-MY",
      {
        day: "numeric",
        month: "long",
        year: "numeric",
        timeZone: "UTC"
      }
    );
  }

  function formatDateTime(value) {
    return new Date(value).toLocaleString(
      "en-MY",
      {
        timeZone: "Asia/Kuala_Lumpur",
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit"
      }
    );
  }

  /* ==========================================
     SUPABASE CHAT HISTORY
  ========================================== */

  async function fetchConversations() {
    const { data, error } = await supabaseClient
      .from(CONVERSATION_TABLE)
      .select("id, title, created_at, updated_at")
      .eq("user_id", currentUser.id)
      .order("updated_at", {
        ascending: false
      })
      .limit(100);

    if (error) throw error;

    return data || [];
  }

  function renderConversations(conversations) {
    conversationList.replaceChildren();

    if (conversationCount) {
      conversationCount.textContent =
        `${conversations.length} chats`;
    }

    if (!conversations.length) {
      const empty = document.createElement("p");
      empty.className = "conversation-empty";
      empty.textContent = "No previous chats yet.";

      conversationList.appendChild(empty);
      return;
    }

    conversations.forEach(conversation => {
      const card = document.createElement("div");
      card.className = "conversation-item";

      if (conversation.id === currentConversationId) {
        card.classList.add("active");
      }

      const open = document.createElement("button");
      open.type = "button";
      open.className = "conversation-open-button";

      const info = document.createElement("div");
      info.className = "conversation-info";

      const title = document.createElement("span");
      title.className = "conversation-title";
      title.textContent =
        conversation.title || "New Chat";

      const date = document.createElement("small");
      date.className = "conversation-date";
      date.textContent =
        formatDate(conversation.updated_at);

      info.append(title, date);
      open.appendChild(info);

      open.addEventListener("click", () => {
        openConversation(conversation.id);
      });

      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "delete-chat-button";
      remove.textContent = "Delete";

      remove.addEventListener("click", () => {
        deleteConversation(conversation.id);
      });

      card.append(open, remove);
      conversationList.appendChild(card);
    });
  }

  async function refreshConversations() {
    const conversations = await fetchConversations();
    renderConversations(conversations);
    return conversations;
  }

  async function createConversation() {
    const { data, error } = await supabaseClient
      .from(CONVERSATION_TABLE)
      .insert({
        user_id: currentUser.id,
        title: "New Chat"
      })
      .select("id")
      .single();

    if (error) throw error;
    return data.id;
  }

  async function ensureConversation() {
    if (currentConversationId) {
      return currentConversationId;
    }

    currentConversationId =
      await createConversation();

    saveActiveConversation(currentConversationId);
    await refreshConversations();

    return currentConversationId;
  }

  async function saveMessage(
    role,
    content,
    conversationId
  ) {
    const { error } = await supabaseClient
      .from(CHAT_TABLE)
      .insert({
        user_id: currentUser.id,
        conversation_id: conversationId,
        role,
        content
      });

    if (error) throw error;
  }

  async function loadMessages(conversationId) {
    const { data, error } = await supabaseClient
      .from(CHAT_TABLE)
      .select("id, role, content, created_at")
      .eq("user_id", currentUser.id)
      .eq("conversation_id", conversationId)
      .order("created_at", {
        ascending: false
      })
      .order("id", {
        ascending: false
      })
      .limit(500);

    if (error) throw error;

    const rows = (data || []).reverse();

    history = rows
      .filter(row =>
        ["user", "assistant"].includes(row.role)
      )
      .map(row => ({
        role: row.role,
        content: row.content
      }))
      .slice(-10);

    messagesArea.replaceChildren();

    if (!rows.length) {
      showWelcome();
    } else {
      rows.forEach(row => {
        addMessage(row.role, row.content);
      });
    }
  }

  async function openConversation(id) {
    if (busy) return;

    clearPreview();
    setBusy(true);
    setStatus("Loading conversation...");

    try {
      await loadMessages(id);

      currentConversationId = id;
      saveActiveConversation(id);

      await refreshConversations();
      setStatus("AI ready");
    } catch (error) {
      console.error(error);
      setStatus("Unable to open conversation");
      alert(error.message);
    } finally {
      setBusy(false);
    }
  }

  async function startNewChat() {
    if (busy) return;

    clearPreview();
    setBusy(true);
    setStatus("Creating new chat...");

    try {
      const id = await createConversation();

      currentConversationId = id;
      saveActiveConversation(id);

      history = [];
      showWelcome();

      await refreshConversations();
      setStatus("New chat ready");
    } catch (error) {
      console.error(error);
      alert(error.message);
    } finally {
      setBusy(false);
      input.focus();
    }
  }

  async function deleteConversation(id) {
    if (busy) return;

    if (!confirm(
      "Delete this conversation and all its messages?"
    )) return;

    clearPreview();
    setBusy(true);
    setStatus("Deleting conversation...");

    try {
      const { error: messageError } =
        await supabaseClient
          .from(CHAT_TABLE)
          .delete()
          .eq("user_id", currentUser.id)
          .eq("conversation_id", id);

      if (messageError) throw messageError;

      const { error: conversationError } =
        await supabaseClient
          .from(CONVERSATION_TABLE)
          .delete()
          .eq("user_id", currentUser.id)
          .eq("id", id);

      if (conversationError) {
        throw conversationError;
      }

      if (currentConversationId === id) {
        currentConversationId = null;
        history = [];
        saveActiveConversation(null);
        showWelcome();
      }

      const remaining = await refreshConversations();

      if (
        !currentConversationId &&
        remaining.length
      ) {
        currentConversationId = remaining[0].id;

        await loadMessages(currentConversationId);
        saveActiveConversation(currentConversationId);
        await refreshConversations();
      }

      setStatus("Chat deleted successfully");
    } catch (error) {
      console.error(error);
      setStatus("Delete failed");
      alert(error.message);
    } finally {
      setBusy(false);
    }
  }

  async function updateConversation(id, message) {
    const { data, error } = await supabaseClient
      .from(CONVERSATION_TABLE)
      .select("title")
      .eq("id", id)
      .eq("user_id", currentUser.id)
      .single();

    if (error) throw error;

    const changes = {
      updated_at: new Date().toISOString()
    };

    if (data.title === "New Chat") {
      changes.title = message.slice(0, 60);
    }

    const result = await supabaseClient
      .from(CONVERSATION_TABLE)
      .update(changes)
      .eq("id", id)
      .eq("user_id", currentUser.id);

    if (result.error) throw result.error;
  }

  /* ==========================================
     AI EDGE FUNCTION
  ========================================== */

  async function invokeAI(body) {
    const { data, error } =
      await supabaseClient.functions.invoke(
        FUNCTION_NAME,
        { body }
      );

    if (error) {
      let detail = error.message || "AI request failed";

      if (
        error.context &&
        typeof error.context.json === "function"
      ) {
        try {
          const response = await error.context.json();
          detail = response.error || detail;
        } catch (_) {}
      }

      throw new Error(detail);
    }

    return data;
  }

  /* ==========================================
     COMMAND DETECTION
  ========================================== */

  function isCreationRequest(text) {
    return /\b(add|create|schedule|save|record|plan|book|set|put|remind|tambah|buat|jadualkan|simpan|catat|masukkan|tetapkan|ingatkan)\b/i
      .test(text);
  }

  function studyCandidate(text) {
    if (!isCreationRequest(text)) return false;

    return /\b(assignment|tugasan|homework|study|revision|ulang kaji|belajar|lecture|kuliah|exam|peperiksaan|study hub|kelas)\b/i
      .test(text);
  }

  function plannerCandidate(text) {
    if (!isCreationRequest(text)) return false;

    return /\b(meeting|meet|appointment|event|calendar|planner|schedule|reminder|training|workshop|task|mesyuarat|temujanji|janji temu|perjumpaan|aktiviti|jumpa|esok|tomorrow|today|hari ini|minggu depan|next week)\b/i
      .test(text) ||
      /\b\d{1,2}[\/.-]\d{1,2}/.test(text);
  }

  /* ==========================================
     PLANNER VALIDATION
  ========================================== */

  function validatePlanner(raw) {
    if (
      !raw ||
      typeof raw.name !== "string" ||
      !raw.name.trim() ||
      raw.name.length > 200 ||
      !validDate(raw.date) ||
      !["Work", "Personal"].includes(raw.type) ||
      typeof raw.notes !== "string" ||
      raw.notes.length > 2000
    ) {
      throw new Error(
        "Invalid Planner details. Please provide the activity and date."
      );
    }

    return {
      name: raw.name.trim(),
      date: raw.date,
      type: raw.type,
      notes: raw.notes.trim()
    };
  }

  /* ==========================================
     STUDY HUB VALIDATION
  ========================================== */

  function validateStudy(extracted) {
    const data = extracted?.data;

    if (
      !data ||
      typeof data !== "object" ||
      typeof data.title !== "string" ||
      !data.title.trim() ||
      data.title.length > 200
    ) {
      throw new Error("Invalid Study Hub details.");
    }

    if (extracted.action === "create_assignment") {
      if (
        !validDate(data.due_date) ||
        !["High", "Medium", "Low"].includes(
          data.priority
        )
      ) {
        throw new Error(
          "Invalid assignment deadline or priority."
        );
      }

      return {
        action: "create_assignment",
        data: {
          title: data.title.trim(),
          subject: String(data.subject || "").trim(),
          description: String(
            data.description || ""
          ).slice(0, 2000),
          due_date: data.due_date,
          priority: data.priority
        }
      };
    }

    if (
      extracted.action ===
      "create_study_schedule"
    ) {
      if (
        !validDateTime(data.start_time) ||
        !validDateTime(data.end_time) ||
        Date.parse(data.end_time) <=
        Date.parse(data.start_time)
      ) {
        throw new Error(
          "Invalid Study Schedule date or time."
        );
      }

      return {
        action: "create_study_schedule",
        data: {
          title: data.title.trim(),
          subject: String(data.subject || "").trim(),
          activity_type: String(
            data.activity_type || "Study"
          ).slice(0, 50),
          start_time: data.start_time,
          end_time: data.end_time,
          notes: String(data.notes || "")
            .slice(0, 2000)
        }
      };
    }

    throw new Error("Unsupported Study Hub action.");
  }

  /* ==========================================
     STUDY SUBJECT LOOKUP
  ========================================== */

  async function resolveStudySubject(name) {
    if (!name) return null;

    const { data, error } = await supabaseClient
      .from("study_subjects")
      .select("id, name")
      .eq("user_id", currentUser.id)
      .limit(200);

    if (error) throw error;

    const matches = (data || []).filter(subject =>
      String(subject.name || "")
        .trim()
        .toLowerCase() === name.toLowerCase()
    );

    if (matches.length === 0) {
      throw new Error(
        `Subject "${name}" not found in Study Hub. Please create the subject first.`
      );
    }

    if (matches.length > 1) {
      throw new Error(
        `Multiple subjects named "${name}" found. Please resolve duplicates first.`
      );
    }

    return matches[0].id;
  }

  /* ==========================================
     PREVIEW TEXT
  ========================================== */

  function plannerPreview(plan) {
    return [
      "Review Planner entry before saving:",
      "",
      `Activity: ${plan.name}`,
      `Date: ${formatLocalDate(plan.date)}`,
      `Type: ${plan.type}`,
      `Notes: ${plan.notes || "None"}`,
      "",
      "Nothing has been saved yet."
    ].join("\n");
  }

  function studyPreview(item) {
    const d = item.data;

    if (item.action === "create_assignment") {
      return [
        "Review Study Hub Assignment:",
        "",
        `Title: ${d.title}`,
        `Subject: ${d.subject || "None"}`,
        `Deadline: ${formatLocalDate(d.due_date)}`,
        `Priority: ${d.priority}`,
        `Description: ${d.description || "None"}`,
        "",
        "Nothing has been saved yet."
      ].join("\n");
    }

    return [
      "Review Study Hub Schedule:",
      "",
      `Title: ${d.title}`,
      `Subject: ${d.subject || "None"}`,
      `Activity: ${d.activity_type}`,
      `Start: ${formatDateTime(d.start_time)}`,
      `End: ${formatDateTime(d.end_time)}`,
      `Notes: ${d.notes || "None"}`,
      "",
      "Nothing has been saved yet."
    ].join("\n");
  }

  /* ==========================================
     SAVE PLANNER
  ========================================== */

  async function savePlanner(plan) {
    const verified = validatePlanner(plan);

    const { data, error } = await supabaseClient
      .from("planner_plans")
      .insert({
        user_id: currentUser.id,
        ...verified
      })
      .select("id");

    if (error) throw error;

    if (!data?.length) {
      throw new Error(
        "Planner record not returned. Check Supabase RLS."
      );
    }

    return (
      "Planner saved successfully!\n\n" +
      plannerPreview(verified)
        .replace(
          "Review Planner entry before saving:",
          ""
        )
        .replace(
          "Nothing has been saved yet.",
          ""
        )
        .trim()
    );
  }

  /* ==========================================
     SAVE STUDY HUB
  ========================================== */

  async function saveStudy(item) {
    const verified = validateStudy(item);
    const d = verified.data;

    const subject_id =
      await resolveStudySubject(d.subject);

    let table;
    let payload;

    if (verified.action === "create_assignment") {
      table = "study_assignments";

      payload = {
        user_id: currentUser.id,
        subject_id,
        title: d.title,
        description: d.description,
        due_date: d.due_date,
        priority: d.priority,
        status: "Not Started",
        completed: false
      };
    } else {
      table = "study_schedule";

      payload = {
        user_id: currentUser.id,
        subject_id,
        title: d.title,
        activity_type: d.activity_type,
        start_time:
          new Date(d.start_time).toISOString(),
        end_time:
          new Date(d.end_time).toISOString(),
        notes: d.notes,
        completed: false
      };
    }

    const { data, error } = await supabaseClient
      .from(table)
      .insert(payload)
      .select("id");

    if (error) throw error;

    if (!data?.length) {
      throw new Error(
        "Study Hub record not returned. Check Supabase RLS."
      );
    }

    return (
      verified.action === "create_assignment"
        ? "Assignment saved successfully!"
        : "Study Schedule saved successfully!"
    ) + `\n\nTitle: ${d.title}\nModule: Study Hub`;
  }

  /* ==========================================
     CONFIRM / CANCEL BUTTONS
  ========================================== */

  function showActionButtons(
    messageElement,
    type,
    data,
    conversationId
  ) {
    clearPreview();

    const request = {
      type,
      data,
      conversationId
    };

    pending = request;

    const actions = document.createElement("div");
    actions.className = "elio-ai-actions";

    actions.style.cssText =
      "display:flex;gap:10px;flex-wrap:wrap;margin-top:14px";

    const confirmButton =
      document.createElement("button");

    confirmButton.type = "button";
    confirmButton.className = "elio-ai-action";
    confirmButton.textContent = "Confirm & Save";

    confirmButton.style.cssText =
      "padding:11px 16px;border:0;border-radius:10px;" +
      "background:#567c8d;color:white;font-weight:bold;cursor:pointer";

    const cancelButton =
      document.createElement("button");

    cancelButton.type = "button";
    cancelButton.className = "elio-ai-action";
    cancelButton.textContent = "Cancel";

    cancelButton.style.cssText =
      "padding:11px 16px;border:1px solid #c8d9e6;" +
      "border-radius:10px;background:#f5efeb;" +
      "color:#2f4156;cursor:pointer";

    actions.append(
      confirmButton,
      cancelButton
    );

    messageElement.appendChild(actions);

    messagesArea.scrollTop =
      messagesArea.scrollHeight;

    confirmButton.addEventListener(
      "click",
      async () => {
        if (
          busy ||
          pending !== request ||
          currentConversationId !== conversationId
        ) return;

        setBusy(true);
        setStatus("Saving entry...");

        try {
          const { data: auth, error: authError } =
            await supabaseClient.auth.getUser();

          if (authError) throw authError;

          if (
            !auth.user ||
            auth.user.id !== currentUser.id
          ) {
            throw new Error(
              "Session expired. Please log in again."
            );
          }

          const result = type === "planner"
            ? await savePlanner(data)
            : await saveStudy(data);

          clearPreview();

          addMessage("assistant", result);
          remember("assistant", result);

          try {
            await saveMessage(
              "assistant",
              result,
              conversationId
            );

            await updateConversation(
              conversationId,
              result
            );

            await refreshConversations();
          } catch (historyError) {
            console.error(
              "Record saved, but chat history update failed:",
              historyError
            );
          }

          setStatus("Saved successfully");
        } catch (error) {
          console.error("Save error:", error);

          addMessage(
            "error",
            `Unable to save: ${error.message}`
          );

          setStatus("Save failed");
        } finally {
          setBusy(false);
        }
      }
    );

    cancelButton.addEventListener(
      "click",
      async () => {
        if (
          busy ||
          pending !== request ||
          currentConversationId !== conversationId
        ) return;

        clearPreview();

        const message =
          "Entry cancelled. Nothing was saved.";

        addMessage("assistant", message);
        remember("assistant", message);

        setStatus("Entry cancelled");

        try {
          await saveMessage(
            "assistant",
            message,
            conversationId
          );
        } catch (error) {
          console.error(
            "Unable to save cancellation message:",
            error
          );
        }
      }
    );
  }

  /* ==========================================
     SEND MESSAGE
  ========================================== */

  async function sendMessage(event) {
    event.preventDefault();

    if (busy) return;

    const text = input.value.trim();

    if (!text) return;

    if (text.length > 2000) {
      alert("Maximum 2000 characters.");
      return;
    }

    if (!currentUser) {
      window.location.replace("login.html");
      return;
    }

    const previousHistory = history.slice(-10);

    clearPreview();
    setBusy(true);
    setStatus("AI is thinking...");

    let conversationId = null;
    let userSaved = false;
    let loadingMessage = null;

    try {
      const { data: sessionData, error: sessionError } =
        await supabaseClient.auth.getSession();

      if (sessionError) throw sessionError;

      if (!sessionData.session?.access_token) {
        throw new Error(
          "Session expired. Please log in again."
        );
      }

      conversationId = await ensureConversation();

      await saveMessage(
        "user",
        text,
        conversationId
      );

      userSaved = true;

      addMessage("user", text);

      input.value = "";
      updateCounter();

      loadingMessage = addMessage(
        "assistant",
        "Thinking..."
      );

      let reply = "";
      let previewType = null;
      let previewData = null;

      /* STUDY HUB */

      if (studyCandidate(text)) {
        setStatus("Preparing Study Hub entry...");

        const extracted = await invokeAI({
          mode: "study_extract",
          message: text,
          local_date: malaysiaToday()
        });

        if (
          [
            "create_assignment",
            "create_study_schedule"
          ].includes(extracted?.action)
        ) {
          const study = validateStudy(extracted);

          previewType = "study";
          previewData = study;
          reply = studyPreview(study);

        } else if (
          extracted?.action ===
          "needs_clarification"
        ) {
          reply = extracted.reply ||
            "Please provide the missing Study Hub details.";

        } else if (extracted?.action === "none") {
          const chat = await invokeAI({
            mode: "chat",
            message: text,
            history: previousHistory
          });

          reply = chat?.reply;
        } else {
          throw new Error(
            "Invalid Study Hub response."
          );
        }

      /* SMART PLANNER */

      } else if (plannerCandidate(text)) {
        setStatus("Preparing Planner entry...");

        const extracted = await invokeAI({
          mode: "planner_extract",
          message: text,
          local_date: malaysiaToday()
        });

        if (extracted?.action === "create_planner") {
          const plan = validatePlanner(
            extracted.data
          );

          previewType = "planner";
          previewData = plan;
          reply = plannerPreview(plan);

        } else if (
          extracted?.action ===
          "needs_clarification"
        ) {
          reply = extracted.reply ||
            "Please provide the activity and date.";

        } else if (extracted?.action === "none") {
          const chat = await invokeAI({
            mode: "chat",
            message: text,
            history: previousHistory
          });

          reply = chat?.reply;
        } else {
          throw new Error(
            "Invalid Smart Planner response."
          );
        }

      /* NORMAL AI CHAT */

      } else {
        const chat = await invokeAI({
          mode: "chat",
          message: text,
          history: previousHistory
        });

        reply = chat?.reply;
      }

      if (
        typeof reply !== "string" ||
        !reply.trim()
      ) {
        throw new Error("Invalid AI response.");
      }

      loadingMessage.textContent = reply;

      remember("user", text);
      remember("assistant", reply);

      try {
        await saveMessage(
          "assistant",
          reply,
          conversationId
        );
      } catch (error) {
        console.error(
          "Unable to save AI reply:",
          error
        );
      }

      try {
        await updateConversation(
          conversationId,
          text
        );

        await refreshConversations();
      } catch (error) {
        console.error(
          "Unable to update conversation:",
          error
        );
      }

      if (previewType) {
        showActionButtons(
          loadingMessage,
          previewType,
          previewData,
          conversationId
        );

        setStatus(
          "Review entry before saving"
        );
      } else {
        setStatus("AI ready");
      }

    } catch (error) {
      console.error("ELIO AI error:", error);

      if (loadingMessage) {
        loadingMessage.remove();
      }

      if (userSaved) {
        remember("user", text);
      }

      addMessage(
        "error",
        error.message || "Unable to connect to AI."
      );

      setStatus("Connection error");
    } finally {
      setBusy(false);
      input.focus();
    }
  }

  /* ==========================================
     INITIALIZATION
  ========================================== */

  async function init() {
    setBusy(true);
    setStatus("Loading ELIO AI...");

    try {
      if (
        typeof supabaseClient === "undefined"
      ) {
        throw new Error(
          "Supabase configuration missing."
        );
      }

      const { data, error } =
        await supabaseClient.auth.getUser();

      if (error) throw error;

      currentUser = data.user;

      if (!currentUser) {
        window.location.replace("login.html");
        return;
      }

      const conversations =
        await refreshConversations();

      const savedId =
        getActiveConversation();

      let selected = null;

      if (
        savedId &&
        conversations.some(
          conversation =>
            conversation.id === savedId
        )
      ) {
        selected = savedId;
      } else if (conversations.length) {
        selected = conversations[0].id;
      }

      if (selected) {
        currentConversationId = selected;

        await loadMessages(selected);

        saveActiveConversation(selected);
        await refreshConversations();
      } else {
        currentConversationId = null;
        history = [];
        showWelcome();
      }

      setStatus("AI ready");
    } catch (error) {
      console.error(
        "ELIO AI initialization error:",
        error
      );

      setStatus("Unable to load AI");

      addMessage(
        "error",
        error.message || "Initialization failed."
      );
    } finally {
      setBusy(false);
    }
  }

  /* ==========================================
     EVENT LISTENERS
  ========================================== */

  input.addEventListener(
    "input",
    updateCounter
  );

  input.addEventListener(
    "keydown",
    event => {
      if (
        event.key === "Enter" &&
        !event.shiftKey
      ) {
        event.preventDefault();

        if (!busy) {
          form.requestSubmit();
        }
      }
    }
  );

  form.addEventListener(
    "submit",
    sendMessage
  );

  newChatButton.addEventListener(
    "click",
    startNewChat
  );

  if (document.readyState === "loading") {
    document.addEventListener(
      "DOMContentLoaded",
      init
    );
  } else {
    init();
  }

})();
