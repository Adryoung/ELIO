
/* ==========================================
   MELLYNNA OS - SMART PLANNER AI
   Extract → Review → Confirm → Supabase
========================================== */

(() => {
  "use strict";

  const $ = id => document.getElementById(id);

  const form = $("smart-planner-form");
  const input = $("smart-planner-input");
  const extractButton = $("smart-planner-extract");
  const status = $("smart-planner-status");
  const preview = $("smart-planner-preview");

  if (!form || !input || !preview) {
    console.error("Smart Planner elements missing.");
    return;
  }

  let pendingPlan = null;
  let busy = false;

  function setStatus(message) {
    status.textContent = message;
  }

  function setBusy(value) {
    busy = value;
    input.disabled = value;
    extractButton.disabled = value;
    extractButton.textContent = value
      ? "Analysing..."
      : "Prepare Planner Entry";
  }

  function localDate() {
    const now = new Date();

    const parts = new Intl.DateTimeFormat(
      "en-CA",
      {
        timeZone: "Asia/Kuala_Lumpur",
        year: "numeric",
        month: "2-digit",
        day: "2-digit"
      }
    ).formatToParts(now);

    const get = type =>
      parts.find(part => part.type === type)?.value;

    return `${get("year")}-${get("month")}-${get("day")}`;
  }

  function validDate(value) {
    if (
      typeof value !== "string" ||
      !/^\d{4}-\d{2}-\d{2}$/.test(value)
    ) return false;

    const [y, m, d] = value.split("-").map(Number);
    const date = new Date(Date.UTC(y, m - 1, d));

    return (
      date.getUTCFullYear() === y &&
      date.getUTCMonth() === m - 1 &&
      date.getUTCDate() === d
    );
  }

  function validatePlan(data) {
    if (
      !data ||
      typeof data.name !== "string" ||
      !data.name.trim() ||
      data.name.length > 200 ||
      !validDate(data.date) ||
      !["Work", "Personal"].includes(data.type) ||
      typeof data.notes !== "string" ||
      data.notes.length > 2000
    ) {
      throw new Error("Invalid Planner details.");
    }

    return {
      name: data.name.trim(),
      date: data.date,
      type: data.type,
      notes: data.notes.trim()
    };
  }

  function createText(tag, text) {
    const element = document.createElement(tag);
    element.textContent = text;
    return element;
  }

  function clearPreview() {
    pendingPlan = null;
    preview.replaceChildren();
  }

  function showPreview(plan) {
    clearPreview();
    pendingPlan = plan;

    const card = document.createElement("div");
    card.className = "smart-planner-card";

    card.style.cssText = `
      background: #f5f9fc;
      border: 1px solid #c8d9e6;
      border-radius: 14px;
      padding: 18px;
      margin-top: 16px;
    `;

    card.append(
      createText("h3", "Review Planner Entry"),
      createText("p", `Activity: ${plan.name}`),
      createText("p", `Date: ${plan.date}`),
      createText("p", `Type: ${plan.type}`),
      createText(
        "p",
        `Notes: ${plan.notes || "None"}`
      )
    );

    const buttons = document.createElement("div");
    buttons.style.cssText = `
      display: flex;
      gap: 10px;
      margin-top: 16px;
    `;

    const confirmButton = createText(
      "button",
      "Confirm & Save"
    );

    confirmButton.type = "button";
    confirmButton.style.cssText = `
      background: #567c8d;
      color: white;
      border: none;
      padding: 12px 18px;
      border-radius: 10px;
      cursor: pointer;
    `;

    const cancelButton = createText(
      "button",
      "Cancel"
    );

    cancelButton.type = "button";
    cancelButton.style.cssText = `
      background: #f5efeb;
      color: #2f4156;
      border: 1px solid #c8d9e6;
      padding: 12px 18px;
      border-radius: 10px;
      cursor: pointer;
    `;

    confirmButton.addEventListener(
      "click",
      saveConfirmedPlan
    );

    cancelButton.addEventListener("click", () => {
      if (busy) return;

      clearPreview();
      setStatus("Planner entry cancelled.");
    });

    buttons.append(confirmButton, cancelButton);
    card.appendChild(buttons);
    preview.appendChild(card);
  }

  async function getAuthenticatedUser() {
    if (typeof supabaseClient === "undefined") {
      throw new Error("Supabase not configured.");
    }

    const { data, error } =
      await supabaseClient.auth.getUser();

    if (error) throw error;

    if (!data?.user) {
      throw new Error("Please log in again.");
    }

    return data.user;
  }

  async function extractPlan(event) {
    event.preventDefault();

    if (busy) return;

    const message = input.value.trim();

    if (!message || message.length > 2000) {
      setStatus("Enter a message up to 2000 characters.");
      return;
    }

    // Invalidate any earlier proposal immediately.
    clearPreview();
    setBusy(true);
    setStatus("AI is preparing your Planner entry...");

    try {
      await getAuthenticatedUser();

      const { data, error } =
        await supabaseClient.functions.invoke(
          "dynamic-service",
          {
            body: {
              mode: "planner_extract",
              message,
              local_date: localDate()
            }
          }
        );

      if (error) {
        let detail = error.message;

        if (error.context instanceof Response) {
          try {
            const body = await error.context.json();
            detail = body.error || detail;
          } catch (_) {}
        }

        throw new Error(detail);
      }

      if (data?.action === "needs_clarification") {
        setStatus(
          "Please include a clear date and try again."
        );
        return;
      }

      if (data?.action === "none") {
        setStatus(
          "No Planner creation request detected."
        );
        return;
      }

      if (data?.action !== "create_planner") {
        throw new Error("Unexpected AI response.");
      }

      const plan = validatePlan(data.data);

      showPreview(plan);
      setStatus("Review the details before saving.");

    } catch (error) {
      console.error("Smart Planner error:", error);
      setStatus(
        `Unable to prepare plan: ${error.message}`
      );

    } finally {
      setBusy(false);
    }
  }

  async function saveConfirmedPlan() {
    if (busy || !pendingPlan) return;

    const plan = { ...pendingPlan };

    setBusy(true);
    setStatus("Saving to Supabase...");

    try {
      const user = await getAuthenticatedUser();

      const { data, error } = await supabaseClient
        .from("planner_plans")
        .insert({
          user_id: user.id,
          name: plan.name,
          date: plan.date,
          type: plan.type,
          notes: plan.notes
        })
        .select("id");

      if (error) throw error;

      if (!data?.length) {
        throw new Error("Plan was not saved.");
      }

      clearPreview();
      input.value = "";

      setStatus(
        "Saved successfully! Open Planner to view."
      );

    } catch (error) {
      console.error("Save Planner error:", error);
      setStatus(
        `Save failed: ${error.message}`
      );

    } finally {
      setBusy(false);
    }
  }

  // A changed instruction invalidates the old proposal.
  input.addEventListener("input", () => {
    if (pendingPlan) {
      clearPreview();
      setStatus(
        "Instruction changed. Prepare a new entry."
      );
    }
  });

  form.addEventListener("submit", extractPlan);

  setStatus("Smart Planner ready.");
})();
