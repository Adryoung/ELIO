
/* ==========================================
   ELIO - WORK MODULE
   Work Tasks + Planner Work
   Supabase Integration
   Add / Edit / Delete / Complete
========================================== */

"use strict";

(() => {
  const $ = id => document.getElementById(id);

  const showButton = $("show-work-form");
  const form = $("work-form");
  const formTitle = $("work-form-title");

  const nameInput = $("work-task-name");
  const dateInput = $("work-task-date");
  const notesInput = $("work-task-notes");

  const saveButton = $("save-work-task");
  const cancelButton = $("cancel-work-task");

  const openList = $("work-task-list");
  const completedList = $("work-completed-list");

  if (
    !form || !nameInput || !dateInput ||
    !notesInput || !saveButton ||
    !openList || !completedList
  ) {
    console.error("ELIO Work: HTML elements missing.");
    return;
  }

  let currentUser = null;
  let workTasks = [];
  let plannerTasks = [];

  let editingId = null;
  let editingSource = null;
  let busy = false;

  // ==========================================
  // DATE HELPERS
  // ==========================================

  function todayLocal() {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Kuala_Lumpur",
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).formatToParts(new Date());

    const get = type =>
      parts.find(p => p.type === type)?.value;

    return `${get("year")}-${get("month")}-${get("day")}`;
  }

  function formatDate(value) {
    if (!value) return "";

    const parts = String(value).slice(0, 10).split("-");

    return parts.length === 3
      ? `${parts[2]}/${parts[1]}/${parts[0]}`
      : String(value);
  }

  function node(tag, className = "", value) {
    const element = document.createElement(tag);

    if (className) element.className = className;

    if (value !== undefined) {
      element.textContent = String(value);
    }

    return element;
  }

  function showMessage(container, message) {
    if (!container) return;

    container.replaceChildren(
      node("div", "empty-state", message)
    );
  }

  function showError(action, error) {
    console.error(action, error);
    alert(`${action}: ${error?.message || String(error)}`);
  }

  function isWorkPlan(plan) {
    return String(plan.type || "")
      .trim()
      .toLowerCase() === "work";
  }

  // ==========================================
  // BUSY STATE
  // ==========================================

  function setBusy(value) {
    busy = value;

    if (showButton) {
      showButton.disabled = value || !currentUser;
    }

    if (saveButton) {
      saveButton.disabled = value || !currentUser;
    }

    if (cancelButton) {
      cancelButton.disabled = value;
    }

    document.querySelectorAll(
      "#work-task-list .task-actions button, " +
      "#work-completed-list .task-actions button, " +
      "#work-task-list input[type='checkbox'], " +
      "#work-completed-list input[type='checkbox']"
    ).forEach(element => {
      element.disabled = value;
    });
  }

  // ==========================================
  // FORM
  // ==========================================

  function resetForm() {
    editingId = null;
    editingSource = null;

    nameInput.value = "";
    dateInput.value = "";
    notesInput.value = "";

    formTitle.textContent = "Add Work Task";
    saveButton.textContent = "Add Task";
  }

  function showForm() {
    form.classList.remove("hidden");
    form.style.display = "";
  }

  function hideForm() {
    form.classList.add("hidden");
    form.style.display = "none";
  }

  function openEditForm(item) {
    if (busy) return;

    editingId = item.id;
    editingSource = item.source;

    nameInput.value = item.name || "";
    dateInput.value = item.due_date || "";
    notesInput.value = item.notes || "";

    formTitle.textContent =
      item.source === "planner"
        ? "Edit Planner Work Activity"
        : "Edit Work Task";

    saveButton.textContent = "Save Changes";

    showForm();

    form.scrollIntoView({
      behavior: "smooth",
      block: "start"
    });

    nameInput.focus();
  }

  // ==========================================
  // AUTHENTICATION
  // ==========================================

  async function getCurrentUser() {
    if (typeof supabaseClient === "undefined") {
      throw new Error(
        "Supabase configuration not loaded."
      );
    }

    const { data, error } =
      await supabaseClient.auth.getUser();

    if (error) throw error;

    if (!data?.user) {
      throw new Error("No active login session.");
    }

    return data.user;
  }

  // ==========================================
  // LOAD SUPABASE RECORDS
  // ==========================================

  async function loadAllRows(table, columns) {
    const results = [];
    const pageSize = 500;

    for (let offset = 0; ; offset += pageSize) {
      const { data, error } = await supabaseClient
        .from(table)
        .select(columns)
        .eq("user_id", currentUser.id)
        .order("id", { ascending: true })
        .range(offset, offset + pageSize - 1);

      if (error) throw error;

      results.push(...(data || []));

      if (!data || data.length < pageSize) {
        break;
      }
    }

    return results;
  }

  // ==========================================
  // LOAD WORK + PLANNER
  // ==========================================

  async function loadTasks() {
    if (!currentUser) return;

    const [tasks, plans] = await Promise.all([
      loadAllRows(
        "work_tasks",
        "id,user_id,name,due_date,notes,completed"
      ),
      loadAllRows(
        "planner_plans",
        "id,user_id,name,date,type,notes,completed"
      )
    ]);

    workTasks = tasks;
    plannerTasks = plans.filter(isWorkPlan);

    renderTasks();
  }

  // ==========================================
  // COMBINE TASKS
  // ==========================================

  function getCombinedTasks() {
    const tasks = workTasks.map(task => ({
      id: task.id,
      source: "work",
      name: task.name,
      due_date: task.due_date,
      notes: task.notes || "",
      completed: task.completed === true
    }));

    const plans = plannerTasks.map(plan => ({
      id: plan.id,
      source: "planner",
      name: plan.name,
      due_date: plan.date,
      notes: plan.notes || "",
      completed: plan.completed === true
    }));

    return [...tasks, ...plans].sort((a, b) => {
      if (a.completed !== b.completed) {
        return a.completed ? 1 : -1;
      }

      const dateA = a.due_date || "9999-12-31";
      const dateB = b.due_date || "9999-12-31";

      return (
        dateA.localeCompare(dateB) ||
        String(a.name || "").localeCompare(
          String(b.name || "")
        )
      );
    });
  }

  // ==========================================
  // COUNTERS
  // ==========================================

  function updateCounters(items) {
    const today = todayLocal();

    const open = items.filter(
      item => !item.completed
    );

    const completed = items.filter(
      item => item.completed
    );

    const dueToday = open.filter(
      item => item.due_date === today
    );

    $("work-open-count").textContent = open.length;
    $("work-completed-count").textContent =
      completed.length;
    $("work-today-count").textContent =
      dueToday.length;

    $("work-task-count").textContent =
      `${open.length} ${
        open.length === 1 ? "Task" : "Tasks"
      }`;

    const completedCount = $("work-completed-list-count");

    if (completedCount) {
      completedCount.textContent =
        `${completed.length} ${
          completed.length === 1 ? "Task" : "Tasks"
        }`;
    }
  }

  // ==========================================
  // RENDER TASKS
  // ==========================================

  function renderTasks() {
    openList.replaceChildren();
    completedList.replaceChildren();

    const items = getCombinedTasks();
    const today = todayLocal();

    updateCounters(items);

    const open = items.filter(
      item => !item.completed
    );

    const completed = items.filter(
      item => item.completed
    );

    if (!open.length) {
      showMessage(
        openList,
        "No open Work tasks."
      );
    }

    if (!completed.length) {
      showMessage(
        completedList,
        "No completed tasks yet."
      );
    }

    items.forEach(item => {
      const taskItem = node(
        "div",
        `task-item${item.completed ? " completed" : ""}`
      );

      // CHECKBOX
      const checkbox = node("input");
      checkbox.type = "checkbox";
      checkbox.checked = item.completed;

      checkbox.setAttribute(
        "aria-label",
        `Mark ${item.name} as completed`
      );

      // DETAILS
      const details = node("div", "task-details");

      details.appendChild(
        node(
          "h3",
          "",
          item.name || "Untitled Task"
        )
      );

      const meta = node("div", "task-meta");

      // SOURCE BADGE
      meta.appendChild(
        node(
          "span",
          "badge category-other",
          item.source === "planner"
            ? "Planner · Work"
            : "Work"
        )
      );

      // DUE DATE
      meta.appendChild(
        node(
          "span",
          "",
          item.due_date
            ? `Due ${formatDate(item.due_date)}`
            : "No due date"
        )
      );

      // DUE TODAY
      if (
        !item.completed &&
        item.due_date === today
      ) {
        meta.appendChild(
          node(
            "span",
            "badge due-today",
            "Due Today"
          )
        );
      }

      // OVERDUE
      if (
        !item.completed &&
        item.due_date &&
        item.due_date < today
      ) {
        meta.appendChild(
          node(
            "span",
            "badge overdue-badge",
            "Overdue"
          )
        );
      }

      details.appendChild(meta);

      // NOTES
      if (item.notes) {
        details.appendChild(
          node(
            "p",
            "task-notes",
            item.notes
          )
        );
      }

      // ACTION BUTTONS
      const actions = node(
        "div",
        "task-actions"
      );

      const editButton = node(
        "button",
        "edit-button",
        "Edit"
      );
      editButton.type = "button";

      const deleteButton = node(
        "button",
        "delete-button",
        "Delete"
      );
      deleteButton.type = "button";

      actions.append(
        editButton,
        deleteButton
      );

      taskItem.append(
        checkbox,
        details,
        actions
      );

      // CHECKBOX EVENT
      checkbox.addEventListener(
        "change",
        async () => {
          if (busy) {
            renderTasks();
            return;
          }

          await updateTaskStatus(
            item,
            checkbox.checked
          );
        }
      );

      // EDIT EVENT
      editButton.addEventListener(
        "click",
        () => openEditForm(item)
      );

      // DELETE EVENT
      deleteButton.addEventListener(
        "click",
        () => deleteItem(item)
      );

      // OPEN / COMPLETED LIST
      if (item.completed) {
        completedList.appendChild(taskItem);
      } else {
        openList.appendChild(taskItem);
      }
    });
  }

  // ==========================================
  // SAVE WORK / PLANNER
  // ==========================================

  async function saveTask() {
    if (busy || !currentUser) return;

    const name = nameInput.value.trim();
    const dueDate = dateInput.value || null;
    const notes = notesInput.value.trim();

    if (!name) {
      alert("Please enter a task name.");
      nameInput.focus();
      return;
    }

    if (
      editingSource === "planner" &&
      !dueDate
    ) {
      alert(
        "Please select a date for Planner activity."
      );

      dateInput.focus();
      return;
    }

    setBusy(true);

    try {
      let query;

      if (editingSource === "planner") {
        // UPDATE PLANNER WORK ACTIVITY
        query = supabaseClient
          .from("planner_plans")
          .update({
            name,
            date: dueDate,
            notes
          })
          .eq("id", editingId)
          .eq("user_id", currentUser.id)
          .ilike("type", "work");

      } else if (editingId !== null) {
        // UPDATE WORK TASK
        query = supabaseClient
          .from("work_tasks")
          .update({
            name,
            due_date: dueDate,
            notes
          })
          .eq("id", editingId)
          .eq("user_id", currentUser.id);

      } else {
        // ADD WORK TASK
        query = supabaseClient
          .from("work_tasks")
          .insert({
            user_id: currentUser.id,
            name,
            due_date: dueDate,
            notes,
            completed: false
          });
      }

      const { data, error } =
        await query.select("id");

      if (error) throw error;

      if (!data?.length) {
        throw new Error(
          "No record was saved."
        );
      }

      resetForm();
      hideForm();
      await loadTasks();

    } catch (error) {
      showError(
        "Unable to save Work task",
        error
      );

    } finally {
      setBusy(false);
    }
  }

  // ==========================================
  // UPDATE COMPLETED STATUS
  // ==========================================

  async function updateTaskStatus(item, completed) {
    if (busy || !currentUser) return;

    setBusy(true);

    try {
      const isPlanner =
        item.source === "planner";

      let query = supabaseClient
        .from(
          isPlanner ? "planner_plans" : "work_tasks"
        )
        .update({ completed })
        .eq("id", item.id)
        .eq("user_id", currentUser.id);

      if (isPlanner) {
        query = query.ilike("type", "work");
      }

      const { data, error } =
        await query.select("id");

      if (error) throw error;

      if (!data?.length) {
        throw new Error(
          "Task status was not updated."
        );
      }

      await loadTasks();

    } catch (error) {
      showError(
        "Unable to update status",
        error
      );

      renderTasks();

    } finally {
      setBusy(false);
    }
  }

  // ==========================================
  // DELETE WORK / PLANNER
  // ==========================================

  async function deleteItem(item) {
    if (busy || !currentUser) return;

    const isPlanner =
      item.source === "planner";

    const confirmed = confirm(
      `Delete ${
        isPlanner
          ? "Planner Work activity"
          : "Work task"
      } "${item.name}"?`
    );

    if (!confirmed) return;

    setBusy(true);

    try {
      let query = supabaseClient
        .from(
          isPlanner ? "planner_plans" : "work_tasks"
        )
        .delete()
        .eq("id", item.id)
        .eq("user_id", currentUser.id);

      if (isPlanner) {
        query = query.ilike("type", "work");
      }

      const { data, error } =
        await query.select("id");

      if (error) throw error;

      if (!data?.length) {
        throw new Error(
          "Record was not deleted."
        );
      }

      if (
        editingId === item.id &&
        editingSource === item.source
      ) {
        resetForm();
        hideForm();
      }

      await loadTasks();

    } catch (error) {
      showError(
        "Unable to delete record",
        error
      );

    } finally {
      setBusy(false);
    }
  }

  // ==========================================
  // BUTTON EVENTS
  // ==========================================

  showButton?.addEventListener(
    "click",
    () => {
      if (busy || !currentUser) return;

      resetForm();
      showForm();
      nameInput.focus();
    }
  );

  cancelButton?.addEventListener(
    "click",
    () => {
      if (busy) return;

      resetForm();
      hideForm();
    }
  );

  saveButton?.addEventListener(
    "click",
    saveTask
  );

  // ==========================================
  // INITIALIZE
  // ==========================================

  async function initializeWork() {
    resetForm();
    hideForm();
    setBusy(true);

    showMessage(
      openList,
      "Loading Work tasks..."
    );

    completedList.replaceChildren();

    try {
      currentUser = await getCurrentUser();

      await loadTasks();

      console.log(
        "ELIO Work + Planner integration loaded."
      );

    } catch (error) {
      showError(
        "Unable to load Work",
        error
      );

      showMessage(
        openList,
        "Unable to load tasks. Check Supabase."
      );

    } finally {
      setBusy(false);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener(
      "DOMContentLoaded",
      initializeWork
    );
  } else {
    initializeWork();
  }

  window.addEventListener(
    "pageshow",
    event => {
      if (event.persisted && currentUser) {
        loadTasks().catch(console.error);
      }
    }
  );

})();
