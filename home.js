
"use strict";

/* ==========================================
   ELIO SMART HOME DASHBOARD
   PHASE 5
   Work + Personal + Planner + Study Hub
   Countdown + Progress + Expenses
========================================== */

(() => {

  const $ = id => document.getElementById(id);
  const TZ = "Asia/Kuala_Lumpur";

  // ==========================================
  // DATE HELPERS
  // ==========================================

  function dateParts(value = new Date()) {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: TZ,
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).formatToParts(value);

    const get = type =>
      parts.find(p => p.type === type)?.value;

    return `${get("year")}-${get("month")}-${get("day")}`;
  }

  function today() {
    return dateParts();
  }

  function localDate(value) {
    if (!value) return "";

    const text = String(value);

    // Supabase DATE fields
    if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
      return text;
    }

    // Supabase TIMESTAMPTZ fields
    const parsed = new Date(text);

    if (Number.isNaN(parsed.getTime())) {
      return "";
    }

    return dateParts(parsed);
  }

  function dayNumber(value) {
    if (!value) return NaN;

    const match = value.match(
      /^(\d{4})-(\d{2})-(\d{2})$/
    );

    if (!match) return NaN;

    return Date.UTC(
      Number(match[1]),
      Number(match[2]) - 1,
      Number(match[3])
    ) / 86400000;
  }

  function daysUntil(value) {
    return dayNumber(localDate(value)) -
      dayNumber(today());
  }

  function countdown(value) {
    const days = daysUntil(value);

    if (!Number.isFinite(days)) {
      return "No deadline";
    }

    if (days < 0) {
      const overdue = Math.abs(days);
      return overdue === 1
        ? "1 day overdue"
        : `${overdue} days overdue`;
    }

    if (days === 0) return "Due Today";
    if (days === 1) return "1 day left";

    return `${days} days left`;
  }

  function formatDate(value) {
    const date = localDate(value);

    if (!date) return "No date";

    const [y, m, d] = date.split("-").map(Number);

    return new Date(
      Date.UTC(y, m - 1, d)
    ).toLocaleDateString("en-MY", {
      timeZone: "UTC",
      day: "numeric",
      month: "short",
      year: "numeric"
    });
  }

  function formatTime(value) {
    if (!value) return "";

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) return "";

    return new Intl.DateTimeFormat("en-MY", {
      timeZone: TZ,
      hour: "2-digit",
      minute: "2-digit",
      hour12: true
    }).format(date);
  }

  // ==========================================
  // DOM HELPERS
  // ==========================================

  function setText(id, value) {
    const target = $(id);

    if (target) {
      target.textContent = String(value);
    }
  }

  function element(tag, className = "", text) {
    const node = document.createElement(tag);

    if (className) node.className = className;

    if (text !== undefined) {
      node.textContent = String(text);
    }

    return node;
  }

  function empty(container, message) {
    if (!container) return;

    container.replaceChildren(
      element("p", "empty-state", message)
    );
  }

  function isCompleted(item) {
    return item.completed === true;
  }

  // ==========================================
  // GREETING
  // ==========================================

  function renderGreeting() {
    const now = new Date();

    const date = new Intl.DateTimeFormat("en-GB", {
      timeZone: TZ,
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric"
    }).format(now);

    setText("current-date", date);

    const hour = Number(
      new Intl.DateTimeFormat("en-GB", {
        timeZone: TZ,
        hour: "2-digit",
        hourCycle: "h23"
      }).format(now)
    );

    const greeting =
      hour < 12
        ? "Good Morning 👋"
        : hour < 18
          ? "Good Afternoon 👋"
          : "Good Evening 👋";

    setText("greeting-text", greeting);
  }

  // ==========================================
  // SUPABASE
  // ==========================================

  async function getUser() {
    if (typeof supabaseClient === "undefined") {
      throw new Error("Supabase client not found");
    }

    const { data, error } =
      await supabaseClient.auth.getUser();

    if (error) throw error;

    if (!data?.user) {
      throw new Error("User not logged in");
    }

    return data.user;
  }

  async function loadRows(table, columns, userId) {
    const rows = [];
    const pageSize = 500;

    for (let offset = 0; ; offset += pageSize) {

      const { data, error } = await supabaseClient
        .from(table)
        .select(columns)
        .eq("user_id", userId)
        .order("id", { ascending: true })
        .range(offset, offset + pageSize - 1);

      if (error) {
        console.error(`Error loading ${table}:`, error);
        throw error;
      }

      rows.push(...(data || []));

      if (!data || data.length < pageSize) {
        break;
      }
    }

    return rows;
  }

  // ==========================================
  // COMBINE ALL ACTIVITIES
  // ==========================================

  function combineTasks(
    work,
    personal,
    plans,
    assignments,
    schedules
  ) {
    return [

      ...work.map(item => ({
        name: item.name,
        date: item.due_date,
        notes: item.notes || "",
        source: "Work",
        completed: isCompleted(item)
      })),

      ...personal.map(item => ({
        name: item.name,
        date: item.due_date,
        notes: item.notes || "",
        source: "Personal",
        completed: isCompleted(item)
      })),

      ...plans.map(item => ({
        name: item.name,
        date: item.date,
        notes: item.notes || "",
        source: `Planner · ${item.type || "Other"}`,
        completed: isCompleted(item)
      })),

      ...assignments.map(item => ({
        name: item.title,
        date: item.due_date,
        notes: item.description || "",
        source: "Study Assignment",
        priority: item.priority || "",
        completed:
          isCompleted(item) ||
          String(item.status || "").toLowerCase() ===
            "completed"
      })),

      ...schedules.map(item => ({
        name: item.title,
        date: localDate(item.start_time),
        notes: item.notes || "",
        source: `Study · ${item.activity_type || "Session"}`,
        time: formatTime(item.start_time),
        completed: isCompleted(item)
      }))

    ];
  }

  // ==========================================
  // ACTIVITY ELEMENT
  // ==========================================

  function taskElement(item, status = "") {
    const wrapper = element("div", "task-item");
    const details = element("div", "task-details");

    const title = element(
      "h3",
      "",
      item.name || "Untitled Activity"
    );

    const metaParts = [
      item.source,
      formatDate(item.date)
    ];

    if (item.time) {
      metaParts.push(item.time);
    }

    if (item.priority) {
      metaParts.push(`Priority: ${item.priority}`);
    }

    if (status) {
      metaParts.push(status);
    }

    const meta = element(
      "p",
      "task-meta",
      metaParts.join(" · ")
    );

    details.append(title, meta);

    if (item.notes) {
      details.append(
        element("p", "task-notes", item.notes)
      );
    }

    wrapper.append(details);

    if (item.completed) {
      wrapper.classList.add("completed");
    }

    return wrapper;
  }

  // ==========================================
  // COUNTERS
  // ==========================================

  function renderCounters(work, personal, plans) {
    const openWork = work.filter(
      item => !isCompleted(item)
    );

    const openPersonal = personal.filter(
      item => !isCompleted(item)
    );

    const openPlans = plans.filter(
      item => !isCompleted(item)
    );

    const typeIs = (item, type) =>
      String(item.type || "")
        .trim()
        .toLowerCase() === type;

    const plannerWork = openPlans.filter(
      item => typeIs(item, "work")
    );

    const plannerPersonal = openPlans.filter(
      item => typeIs(item, "personal")
    );

    const upcoming = openPlans.filter(
      item => item.date && item.date >= today()
    );

    setText(
      "work-count",
      openWork.length + plannerWork.length
    );

    setText(
      "personal-count",
      openPersonal.length + plannerPersonal.length
    );

    setText("plans-count", upcoming.length);
  }

  // ==========================================
  // TODAY'S FOCUS
  // ==========================================

  function renderToday(items) {
    const container = $("elio-today-list");
    if (!container) return;

    const focus = items
      .filter(item =>
        !item.completed &&
        item.date &&
        localDate(item.date) <= today()
      )
      .sort((a, b) =>
        localDate(a.date).localeCompare(localDate(b.date))
      );

    setText("today-count", focus.length);

    const countLabel =
      document.querySelector(".task-count");

    if (countLabel) {
      countLabel.textContent =
        `${focus.length} ${
          focus.length === 1 ? "Task" : "Tasks"
        }`;
    }

    container.replaceChildren();

    if (!focus.length) {
      empty(container, "Nothing urgent today");
      return;
    }

    focus.forEach(item => {
      container.append(
        taskElement(
          item,
          countdown(item.date)
        )
      );
    });
  }

  // ==========================================
  // UPCOMING ACTIVITIES
  // ==========================================

  function renderUpcoming(items) {
    const container = $("elio-upcoming-list");
    if (!container) return;

    const upcoming = items
      .filter(item =>
        !item.completed &&
        item.date &&
        localDate(item.date) >= today()
      )
      .sort((a, b) =>
        localDate(a.date).localeCompare(localDate(b.date))
      )
      .slice(0, 5);

    container.replaceChildren();

    if (!upcoming.length) {
      empty(container, "No upcoming activities");
      return;
    }

    upcoming.forEach(item => {
      const wrapper = element(
        "div",
        "upcoming-item"
      );

      const details = element("div");

      details.append(
        element(
          "h3",
          "",
          item.name || "Untitled Activity"
        ),
        element(
          "p",
          "",
          `${item.source} · ${formatDate(item.date)}`
        ),
        element(
          "p",
          "",
          countdown(item.date)
        )
      );

      if (item.time) {
        details.append(
          element("p", "", item.time)
        );
      }

      wrapper.append(details);
      container.append(wrapper);
    });
  }

  // ==========================================
  // COMPLETED ACTIVITIES
  // ==========================================

  function renderCompleted(items) {
    const container = $("elio-completed-list");
    if (!container) return;

    const completed = items
      .filter(item => item.completed)
      .sort((a, b) =>
        String(b.date || "").localeCompare(
          String(a.date || "")
        )
      );

    setText(
      "elio-completed-title",
      `Completed (${completed.length})`
    );

    container.replaceChildren();

    if (!completed.length) {
      empty(
        container,
        "No completed activities yet"
      );
      return;
    }

    completed.forEach(item => {
      const wrapper = taskElement(
        item,
        "Completed"
      );

      container.append(wrapper);
    });
  }

  // ==========================================
  // STUDY ASSIGNMENTS
  // ==========================================

  function assignmentCompleted(item) {
    return (
      isCompleted(item) ||
      String(item.status || "").toLowerCase() ===
        "completed"
    );
  }

  function renderAssignments(assignments) {
    const container = $("elio-assignment-list");
    if (!container) return;

    const pending = assignments
      .filter(item => !assignmentCompleted(item))
      .sort((a, b) =>
        String(a.due_date || "9999").localeCompare(
          String(b.due_date || "9999")
        )
      );

    container.replaceChildren();

    if (!pending.length) {
      empty(container, "No pending assignments");
      return;
    }

    pending.slice(0, 5).forEach(item => {
      const activity = {
        name: item.title,
        date: item.due_date,
        notes: item.description || "",
        source: "Assignment",
        priority: item.priority || "",
        completed: false
      };

      container.append(
        taskElement(
          activity,
          countdown(item.due_date)
        )
      );
    });
  }

  // ==========================================
  // STUDY SCHEDULE
  // ==========================================

  function renderStudySchedule(schedules) {
    const container =
      $("elio-study-schedule-list");

    if (!container) return;

    const upcoming = schedules
      .filter(item =>
        !isCompleted(item) &&
        item.start_time &&
        new Date(item.start_time).getTime() >= Date.now()
      )
      .sort((a, b) =>
        new Date(a.start_time) -
        new Date(b.start_time)
      );

    container.replaceChildren();

    if (!upcoming.length) {
      empty(container, "No upcoming study sessions");
      return;
    }

    upcoming.slice(0, 5).forEach(item => {
      const activity = {
        name: item.title,
        date: localDate(item.start_time),
        notes: item.notes || "",
        source: item.activity_type || "Study",
        time: formatTime(item.start_time),
        completed: false
      };

      container.append(
        taskElement(
          activity,
          countdown(item.start_time)
        )
      );
    });
  }

  // ==========================================
  // STUDY PROGRESS
  // ==========================================

  function renderStudyProgress(assignments, schedules) {
    const total = assignments.length;

    const completed = assignments.filter(
      assignmentCompleted
    ).length;

    const pending = total - completed;

    const sessions = schedules.filter(item =>
      !isCompleted(item) &&
      item.start_time &&
      new Date(item.start_time).getTime() >= Date.now()
    ).length;

    const percent = total
      ? Math.round((completed / total) * 100)
      : 0;

    setText("study-pending-count", pending);

    setText(
      "study-completed-count",
      completed
    );

    setText(
      "study-sessions-count",
      sessions
    );

    setText(
      "study-progress-percent",
      `${percent}%`
    );

    const bar = $("study-progress-bar");

    if (bar) {
      bar.style.width = `${percent}%`;
    }

    const track = $("study-progress-track");

    if (track) {
      track.setAttribute(
        "aria-valuenow",
        String(percent)
      );
    }

    setText(
      "study-progress-description",
      total
        ? `${completed} of ${total} assignments completed`
        : "No assignments yet."
    );
  }

  // ==========================================
  // MONTHLY SPENDING
  // ==========================================

  function renderSpending(expenses) {
    const month = today().slice(0, 7);

    let total = 0;
    let grocery = 0;
    let others = 0;

    expenses.forEach(item => {
      if (
        !item.expense_date ||
        String(item.expense_date).slice(0, 7) !== month
      ) {
        return;
      }

      const amount = Number(item.amount || 0);

      if (!Number.isFinite(amount)) return;

      total += amount;

      const category = String(item.category || "")
        .trim()
        .toLowerCase();

      if (category === "grocery") {
        grocery += amount;
      } else {
        others += amount;
      }
    });

    setText(
      "spending-total",
      `RM ${total.toFixed(2)}`
    );

    setText(
      "kitchen-spending",
      `RM ${grocery.toFixed(2)}`
    );

    setText(
      "daily-spending",
      `RM ${others.toFixed(2)}`
    );
  }

  // ==========================================
  // MAIN DASHBOARD
  // ==========================================

  async function renderHome() {
    if (
      !$("elio-home") ||
      !$("elio-today-list")
    ) {
      return;
    }

    renderGreeting();

    try {
      const user = await getUser();

      const [
        work,
        personal,
        plans,
        expenses,
        assignments,
        schedules
      ] = await Promise.all([

        loadRows(
          "work_tasks",
          "id,name,due_date,notes,completed",
          user.id
        ),

        loadRows(
          "personal_tasks",
          "id,name,due_date,category,notes,completed",
          user.id
        ),

        loadRows(
          "planner_plans",
          "id,name,date,type,notes,completed",
          user.id
        ),

        loadRows(
          "expenses",
          "id,amount,category,expense_date",
          user.id
        ),

        loadRows(
          "study_assignments",
          "id,title,description,due_date,priority,status,completed",
          user.id
        ),

        loadRows(
          "study_schedule",
          "id,title,activity_type,start_time,end_time,notes,completed",
          user.id
        )

      ]);

      const combined = combineTasks(
        work,
        personal,
        plans,
        assignments,
        schedules
      );

      renderCounters(work, personal, plans);

      renderToday(combined);

      renderUpcoming(combined);

      renderCompleted(combined);

      renderAssignments(assignments);

      renderStudySchedule(schedules);

      renderStudyProgress(
        assignments,
        schedules
      );

      renderSpending(expenses);

      console.log(
        "ELIO Smart Dashboard loaded successfully"
      );

    } catch (error) {
      console.error(
        "ELIO Home Dashboard error:",
        error
      );

      [
        "elio-today-list",
        "elio-upcoming-list",
        "elio-completed-list",
        "elio-assignment-list",
        "elio-study-schedule-list"
      ].forEach(id => {
        empty(
          $(id),
          "Unable to load data. Check Console."
        );
      });
    }
  }

  // ==========================================
  // INITIALIZATION
  // ==========================================

  if (document.readyState === "loading") {
    document.addEventListener(
      "DOMContentLoaded",
      renderHome
    );
  } else {
    renderHome();
  }

  window.addEventListener("pageshow", event => {
    if (event.persisted) {
      renderHome();
    }
  });

})();
