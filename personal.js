
/* ==========================================
   MELLYNNA-OS - PERSONAL MODULE
   Personal Tasks + Planner Personal
   Supabase Integration
========================================== */

"use strict";

(() => {
  const $ = id => document.getElementById(id);

  const showButton = $("show-personal-form");
  const form = $("personal-form");
  const formTitle = $("personal-form-title");

  const nameInput = $("personal-task-name");
  const dateInput = $("personal-task-date");
  const categoryInput = $("personal-task-category");
  const notesInput = $("personal-task-notes");

  const saveButton = $("save-personal-task");
  const cancelButton = $("cancel-personal-task");

  const openList = $("personal-task-list");
  const completedList = $("personal-completed-list");

  let currentUser = null;
  let personalTasks = [];
  let plannerTasks = [];

  let editingId = null;
  let editingSource = null;
  let busy = false;

  // ==========================================
  // DATE FUNCTIONS
  // ==========================================

  function todayLocal() {
    const parts = new Intl.DateTimeFormat(
      "en-GB",
      {
        timeZone: "Asia/Kuala_Lumpur",
        year: "numeric",
        month: "2-digit",
        day: "2-digit"
      }
    ).formatToParts(new Date());

    const get = type =>
      parts.find(p => p.type === type)?.value;

    return `${get("year")}-${get("month")}-${get("day")}`;
  }

  function formatDate(value) {
    if (!value) return "";

    const parts = String(value).split("-");

    return parts.length === 3
      ? `${parts[2]}/${parts[1]}/${parts[0]}`
      : value;
  }

  function isPersonalPlan(plan) {
    return String(plan.type || "")
      .trim()
      .toLowerCase() === "personal";
  }

  // ==========================================
  // SAFE DOM HELPERS
  // ==========================================

  function node(tag, className = "", value) {
    const element = document.createElement(tag);

    if (className) {
      element.className = className;
    }

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

    alert(
      `${action}: ${error?.message || String(error)}`
    );
  }

  function categoryClass(category) {
    switch (category) {
      case "Home":
        return "category-home";

      case "Errands":
        return "category-errands";

      case "Self Care":
        return "category-self";

      case "Family":
      case "Friends":
        return "category-family-friends";

      default:
        return "category-other";
    }
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
      ".task-actions button, .task-item input[type='checkbox']"
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
    categoryInput.value = "Home";
    notesInput.value = "";

    formTitle.textContent = "Add Personal Task";
    saveButton.textContent = "Add Task";
  }

  function openEditForm(item) {
    if (busy) return;

    editingId = item.id;
    editingSource = item.source;

    nameInput.value = item.name || "";
    dateInput.value = item.due_date || "";
    notesInput.value = item.notes || "";

    // Planner does not have a Personal subcategory.
    categoryInput.value =
      item.source === "planner"
        ? "Home"
        : item.category || "Home";

    categoryInput.disabled =
      item.source === "planner";

    formTitle.textContent =
      item.source === "planner"
        ? "Edit Planner Activity"
        : "Edit Personal Task";

    saveButton.textContent = "Save Changes";

    form.classList.remove("hidden");

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
  // LOAD PERSONAL + PLANNER
  // ==========================================

  async function loadTasks() {
    if (!currentUser) return;

    const [tasks, plans] = await Promise.all([
      loadAllRows(
        "personal_tasks",
        "id,user_id,name,due_date,category,notes,completed,created_at"
      ),
      loadAllRows(
        "planner_plans",
        "id,user_id,name,date,type,notes,completed"
      )
    ]);

    personalTasks = tasks;
    plannerTasks = plans.filter(isPersonalPlan);

    renderTasks();
  }

  // ==========================================
  // COMBINE TASKS
  // ==========================================

  function getCombinedTasks() {
    const tasks = personalTasks.map(task => ({
      id: task.id,
      source: "personal",
      name: task.name,
      due_date: task.due_date,
      category: task.category || "Home",
      notes: task.notes || "",
      completed: task.completed === true
    }));

    const plans = plannerTasks.map(plan => ({
      id: plan.id,
      source: "planner",
      name: plan.name,
      due_date: plan.date,
      category: "Planner",
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

    const setText = (id, value) => {
      const element = $(id);

      if (element) {
        element.textContent = value;
      }
    };

    setText("personal-open-count", open.length);

    setText(
      "personal-completed-count",
      completed.length
    );

    setText(
      "personal-today-count",
      dueToday.length
    );

    setText(
      "personal-task-count",
      `${open.length} ${
        open.length === 1 ? "Task" : "Tasks"
      }`
    );
  }

  // ==========================================
  // RENDER TASKS
  // ==========================================

  function renderTasks() {
    if (!openList || !completedList) return;

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
        "No open personal tasks."
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

      // TASK DETAILS

      const details = node(
        "div",
        "task-details"
      );

      details.appendChild(
        node(
          "h3",
          "",
          item.name || "Untitled Task"
        )
      );

      const meta = node(
        "div",
        "task-meta"
      );

      // CATEGORY

      const categoryBadge = node(
        "span",
        `badge ${
          item.source === "planner"
            ? "category-other"
            : categoryClass(item.category)
        }`,
        item.category
      );

      meta.appendChild(categoryBadge);

      // DATE

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

      // SAME DESIGN FOR BOTH SOURCES

      taskItem.append(
        checkbox,
        details,
        actions
      );

      // CHECKBOX EVENT

      checkbox.addEventListener(
        "change",
        async () => {
          if (busy) return;

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
  // SAVE PERSONAL / PLANNER
  // ==========================================

  async function saveTask() {
    if (busy || !currentUser) return;

    const name = nameInput.value.trim();
    const dueDate = dateInput.value || null;
    const notes = notesInput.value.trim();
    const category = categoryInput.value;

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

        // UPDATE PLANNER ACTIVITY

        query = supabaseClient
          .from("planner_plans")
          .update({
            name,
            date: dueDate,
            notes
          })
          .eq("id", editingId)
          .eq("user_id", currentUser.id)
          .ilike("type", "personal");

      } else if (editingId !== null) {

        // UPDATE PERSONAL TASK

        query = supabaseClient
          .from("personal_tasks")
          .update({
            name,
            due_date: dueDate,
            category,
            notes
          })
          .eq("id", editingId)
          .eq("user_id", currentUser.id);

      } else {

        // ADD PERSONAL TASK

        query = supabaseClient
          .from("personal_tasks")
          .insert({
            user_id: currentUser.id,
            name,
            due_date: dueDate,
            category,
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
      categoryInput.disabled = false;

      form.classList.add("hidden");

      await loadTasks();

    } catch (error) {
      showError(
        "Unable to save task",
        error
      );

    } finally {
      setBusy(false);
    }
  }

  // ==========================================
  // UPDATE COMPLETED STATUS
  // ==========================================

  async function updateTaskStatus(
    item,
    completed
  ) {
    if (busy || !currentUser) return;

    setBusy(true);

    try {
      const isPlanner =
        item.source === "planner";

      const table = isPlanner
        ? "planner_plans"
        : "personal_tasks";

      let query = supabaseClient
        .from(table)
        .update({ completed })
        .eq("id", item.id)
        .eq("user_id", currentUser.id);

      if (isPlanner) {
        query = query.ilike(
          "type",
          "personal"
        );
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
  // DELETE PERSONAL / PLANNER
  // ==========================================

  async function deleteItem(item) {
    if (busy || !currentUser) return;

    const isPlanner =
      item.source === "planner";

    const confirmed = confirm(
      `Delete ${
        isPlanner
          ? "Planner activity"
          : "Personal task"
      } "${item.name}"?`
    );

    if (!confirmed) return;

    setBusy(true);

    try {
      const table = isPlanner
        ? "planner_plans"
        : "personal_tasks";

      let query = supabaseClient
        .from(table)
        .delete()
        .eq("id", item.id)
        .eq("user_id", currentUser.id);

      if (isPlanner) {
        query = query.ilike(
          "type",
          "personal"
        );
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
        categoryInput.disabled = false;
        form.classList.add("hidden");
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

  if (showButton) {
    showButton.addEventListener(
      "click",
      () => {
        if (busy || !currentUser) return;

        resetForm();
        categoryInput.disabled = false;

        form.classList.remove("hidden");
        nameInput.focus();
      }
    );
  }

  if (cancelButton) {
    cancelButton.addEventListener(
      "click",
      () => {
        if (busy) return;

        resetForm();
        categoryInput.disabled = false;

        form.classList.add("hidden");
      }
    );
  }

  if (saveButton) {
    saveButton.addEventListener(
      "click",
      saveTask
    );
  }

  // ==========================================
  // INITIALIZE
  // ==========================================

  async function initializePersonal() {
    resetForm();

    setBusy(true);

    showMessage(
      openList,
      "Loading Personal tasks..."
    );

    if (completedList) {
      completedList.replaceChildren();
    }

    try {
      currentUser = await getCurrentUser();

      await loadTasks();

      console.log(
        "Personal + Planner integration loaded."
      );

    } catch (error) {
      showError(
        "Unable to load Personal",
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
      initializePersonal
    );
  } else {
    initializePersonal();
  }

})();
