
/* ==========================================
   ELIO STUDY HUB
   Subjects, Assignments, Materials, Schedule
   Supabase Database + Private Storage
========================================== */

"use strict";

(() => {
  const $ = id => document.getElementById(id);

  const tables = {
    subject: "study_subjects",
    assignment: "study_assignments",
    material: "study_materials",
    schedule: "study_schedule"
  };

  const state = {
    user: null,
    subjects: [],
    assignments: [],
    materials: [],
    schedule: [],
    editing: {
      subject: null,
      assignment: null,
      schedule: null
    },
    busy: false
  };

  const field = id => $(id).value;

  const value = (id, v) => {
    $(id).value = v ?? "";
  };

  function el(tag, cls = "", text) {
    const element = document.createElement(tag);

    if (cls) element.className = cls;

    if (text !== undefined) {
      element.textContent = String(text);
    }

    return element;
  }

  function today() {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Kuala_Lumpur",
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).formatToParts(new Date());

    const get = type =>
      parts.find(part => part.type === type)?.value;

    return `${get("year")}-${get("month")}-${get("day")}`;
  }

  function dateOnly(value) {
    return value ? String(value).slice(0, 10) : "";
  }

  function dateText(value) {
    return value
      ? dateOnly(value).split("-").reverse().join("/")
      : "No date";
  }

  function dateTimeText(value) {
    return value
      ? new Date(value).toLocaleString("en-GB", {
          dateStyle: "medium",
          timeStyle: "short"
        })
      : "";
  }

  function localInput(value) {
    if (!value) return "";

    const date = new Date(value);
    const pad = n => String(n).padStart(2, "0");

    return (
      `${date.getFullYear()}-` +
      `${pad(date.getMonth() + 1)}-` +
      `${pad(date.getDate())}T` +
      `${pad(date.getHours())}:` +
      `${pad(date.getMinutes())}`
    );
  }

  function subjectName(id) {
    return state.subjects.find(
      subject => String(subject.id) === String(id)
    )?.name || "No subject";
  }

  function notice(message, error = false) {
    const element = $("study-message");

    element.textContent = message;
    element.classList.toggle("error", error);
  }

  function fail(error) {
    console.error(error);
    notice(error.message || String(error), true);
  }

  function toggleForm(type, show) {
    const form = $(`${type}-form`);

    form.classList.toggle("hidden", !show);

    if (show) {
      form.scrollIntoView({
        behavior: "smooth",
        block: "nearest"
      });
    }
  }

  function resetForm(type) {
    state.editing[type] = null;

    $(`${type}-form`).reset();

    const labels = {
      subject: "Subject",
      assignment: "Assignment",
      schedule: "Study Schedule"
    };

    $(`${type}-form-heading`).textContent =
      `Add ${labels[type]}`;
  }

  function action(text, callback, kind = "edit-button") {
    const button = el("button", kind, text);

    button.type = "button";
    button.addEventListener("click", callback);

    return button;
  }

  function meta(container, text, cls = "") {
    container.append(el("span", cls, text));
  }

  function empty(container, text) {
    container.replaceChildren(el("p", "empty", text));
  }

  function actions(container, item, type) {
    const wrapper = el("div", "actions");

    wrapper.append(
      action("Edit", () => edit(type, item)),
      action(
        "Delete",
        () => remove(type, item),
        "delete-button"
      )
    );

    container.append(wrapper);
  }

  // ==========================================
  // SUBJECT DROPDOWN
  // ==========================================

  function selectOptions() {
    const dropdowns = [
      "assignment-subject",
      "material-subject",
      "schedule-subject"
    ];

    dropdowns.forEach(id => {
      const select = $(id);
      const previous = select.value;

      select.replaceChildren();

      const placeholder = el(
        "option",
        "",
        id === "material-subject"
          ? "Select subject"
          : "No subject"
      );

      placeholder.value = "";
      select.append(placeholder);

      state.subjects.forEach(subject => {
        const label = subject.subject_code
          ? `${subject.name} (${subject.subject_code})`
          : subject.name;

        const option = el("option", "", label);

        option.value = subject.id;
        select.append(option);
      });

      select.value = previous;
    });
  }

  // ==========================================
  // LOAD SUPABASE DATA
  // ==========================================

  async function fetchRows(table) {
    const results = [];
    const pageSize = 500;

    for (let start = 0; ; start += pageSize) {
      const { data, error } = await supabaseClient
        .from(table)
        .select("*")
        .eq("user_id", state.user.id)
        .order("id", { ascending: false })
        .range(start, start + pageSize - 1);

      if (error) throw error;

      results.push(...(data || []));

      if (!data || data.length < pageSize) break;
    }

    return results;
  }

  async function refresh() {
    const [
      subjects,
      assignments,
      materials,
      schedule
    ] = await Promise.all([
      fetchRows(tables.subject),
      fetchRows(tables.assignment),
      fetchRows(tables.material),
      fetchRows(tables.schedule)
    ]);

    Object.assign(state, {
      subjects,
      assignments,
      materials,
      schedule
    });

    selectOptions();
    render();
  }

  async function run(work) {
    if (state.busy) return;

    state.busy = true;

    document.querySelectorAll("button").forEach(button => {
      button.disabled = true;
    });

    try {
      await work();
      await refresh();
    } catch (error) {
      fail(error);
    } finally {
      state.busy = false;

      document.querySelectorAll("button").forEach(button => {
        button.disabled = false;
      });
    }
  }

  // ==========================================
  // DATABASE CRUD
  // ==========================================

  async function saveRow(table, payload, id) {
    let query;

    if (id === null) {
      query = supabaseClient
        .from(table)
        .insert({
          ...payload,
          user_id: state.user.id
        });
    } else {
      query = supabaseClient
        .from(table)
        .update(payload)
        .eq("id", id)
        .eq("user_id", state.user.id);
    }

    const { data, error } = await query.select("id");

    if (error) throw error;

    if (!data?.length) {
      throw new Error(
        "No record changed. Check database permissions."
      );
    }
  }

  async function deleteRow(table, id) {
    const { data, error } = await supabaseClient
      .from(table)
      .delete()
      .eq("id", id)
      .eq("user_id", state.user.id)
      .select("id");

    if (error) throw error;

    if (!data?.length) {
      throw new Error("Delete not permitted.");
    }
  }

  // ==========================================
  // EDIT
  // ==========================================

  function edit(type, item) {
    resetForm(type);

    state.editing[type] = item.id;

    $(`${type}-form-heading`).textContent =
      `Edit ${type}`;

    if (type === "subject") {
      value("subject-name", item.name);
      value("subject-code", item.subject_code);
      value("subject-semester", item.semester);
      value("subject-lecturer", item.lecturer);
      value("subject-notes", item.notes);
    }

    if (type === "assignment") {
      value("assignment-title", item.title);
      value("assignment-subject", item.subject_id);
      value("assignment-date", item.due_date);
      value("assignment-priority", item.priority);

      value(
        "assignment-status",
        item.completed ? "Completed" : item.status
      );

      value(
        "assignment-description",
        item.description
      );
    }

    if (type === "schedule") {
      value("schedule-title", item.title);
      value("schedule-subject", item.subject_id);
      value("schedule-type", item.activity_type);
      value(
        "schedule-start",
        localInput(item.start_time)
      );
      value(
        "schedule-end",
        localInput(item.end_time)
      );
      value("schedule-notes", item.notes);
    }

    toggleForm(type, true);
  }

  // ==========================================
  // DELETE
  // ==========================================

  async function remove(type, item) {
    const name = item.title || item.name;

    if (!confirm(`Delete ${type} "${name}"?`)) {
      return;
    }

    if (type === "subject") {
      const used =
        state.assignments.some(
          x => String(x.subject_id) === String(item.id)
        ) ||
        state.schedule.some(
          x => String(x.subject_id) === String(item.id)
        ) ||
        state.materials.some(
          x => String(x.subject_id) === String(item.id)
        );

      if (used) {
        notice(
          "Remove or reassign this subject's " +
          "assignments, schedules and materials first.",
          true
        );
        return;
      }
    }

    await run(async () => {
      await deleteRow(tables[type], item.id);
      notice("Deleted successfully.");
    });
  }

  // ==========================================
  // RENDER SUBJECTS
  // ==========================================

  function renderSubjects() {
    const root = $("subjects-list");

    root.replaceChildren();

    if (!state.subjects.length) {
      empty(root, "No subjects yet. Add your first subject.");
      return;
    }

    for (const item of state.subjects) {
      const card = el("article", "subject-card");

      const heading = el("h3", "", item.name);

      const info = el(
        "p",
        "small",
        [
          item.subject_code,
          item.semester,
          item.lecturer
        ].filter(Boolean).join(" · ")
      );

      card.append(heading, info);

      if (item.notes) {
        card.append(
          el("p", "item-description", item.notes)
        );
      }

      actions(card, item, "subject");
      root.append(card);
    }
  }

  // ==========================================
  // RENDER ASSIGNMENTS
  // ==========================================

  function renderAssignments() {
    const root = $("assignments-list");

    root.replaceChildren();

    if (!state.assignments.length) {
      empty(root, "No assignments yet.");
      return;
    }

    const items = [...state.assignments].sort(
      (a, b) =>
        Number(a.completed) - Number(b.completed) ||
        String(a.due_date || "9999").localeCompare(
          String(b.due_date || "9999")
        )
    );

    for (const item of items) {
      const row = el(
        "article",
        "item-row" + (item.completed ? " completed" : "")
      );

      const check = el("input", "checkbox");

      check.type = "checkbox";
      check.checked = !!item.completed;
      check.setAttribute(
        "aria-label",
        "Complete " + item.title
      );

      check.addEventListener("change", () => {
        run(async () => {
          const done = check.checked;

          await saveRow(
            tables.assignment,
            {
              completed: done,
              status: done
                ? "Completed"
                : "In Progress"
            },
            item.id
          );

          notice("Assignment updated.");
        });
      });

      const main = el("div", "item-main");
      const m = el("div", "item-meta");

      main.append(el("h3", "", item.title));

      meta(
        m,
        subjectName(item.subject_id),
        "badge"
      );

      meta(m, "Due " + dateText(item.due_date));

      meta(
        m,
        item.priority,
        "badge" + (
          item.priority === "High" ? " high" : ""
        )
      );

      meta(
        m,
        item.completed ? "Completed" : item.status,
        "badge" + (
          item.completed ? " done" : ""
        )
      );

      if (
        !item.completed &&
        item.due_date &&
        item.due_date < today()
      ) {
        meta(m, "Overdue", "badge high");
      }

      main.append(m);

      if (item.description) {
        main.append(
          el("p", "item-description", item.description)
        );
      }

      row.append(check, main);
      actions(row, item, "assignment");

      root.append(row);
    }
  }

  // ==========================================
  // RENDER STUDY SCHEDULE
  // ==========================================

  function renderSchedule() {
    const root = $("schedule-list");

    root.replaceChildren();

    if (!state.schedule.length) {
      empty(root, "No study sessions yet.");
      return;
    }

    const items = [...state.schedule].sort(
      (a, b) =>
        String(a.start_time).localeCompare(
          String(b.start_time)
        )
    );

    for (const item of items) {
      const row = el(
        "article",
        "item-row" + (
          item.completed ? " completed" : ""
        )
      );

      const check = el("input", "checkbox");

      check.type = "checkbox";
      check.checked = !!item.completed;
      check.setAttribute(
        "aria-label",
        "Complete " + item.title
      );

      check.addEventListener("change", () => {
        run(async () => {
          await saveRow(
            tables.schedule,
            { completed: check.checked },
            item.id
          );

          notice("Schedule updated.");
        });
      });

      const main = el("div", "item-main");
      const m = el("div", "item-meta");

      main.append(el("h3", "", item.title));

      meta(
        m,
        subjectName(item.subject_id),
        "badge"
      );

      meta(m, item.activity_type, "badge");
      meta(m, dateTimeText(item.start_time));

      if (item.end_time) {
        meta(
          m,
          "Until " + dateTimeText(item.end_time)
        );
      }

      main.append(m);

      if (item.notes) {
        main.append(
          el("p", "item-description", item.notes)
        );
      }

      row.append(check, main);
      actions(row, item, "schedule");

      root.append(row);
    }
  }

  // ==========================================
  // SUPABASE STORAGE
  // ==========================================

  async function signedLink(path, download = false) {
    const options = download
      ? { download: true }
      : {};

    const { data, error } = await supabaseClient
      .storage
      .from("study-slides")
      .createSignedUrl(path, 60, options);

    if (error) throw error;

    return data.signedUrl;
  }

  function renderMaterials() {
    const root = $("materials-list");

    root.replaceChildren();

    if (!state.materials.length) {
      empty(root, "No materials uploaded yet.");
      return;
    }

    for (const item of state.materials) {
      const row = el("article", "item-row");

      const icon = el("span", "file-icon", "📄");
      const main = el("div", "item-main");
      const m = el("div", "item-meta");

      main.append(
        el("h3", "", item.title || item.file_name)
      );

      meta(
        m,
        subjectName(item.subject_id),
        "badge"
      );

      meta(m, item.file_name);

      if (item.file_size) {
        meta(
          m,
          `${(item.file_size / 1048576).toFixed(1)} MB`
        );
      }

      main.append(m);

      const buttons = el("div", "actions");

      buttons.append(
        action("View", async () => {
          try {
            const url = await signedLink(item.file_path);
            window.open(
              url,
              "_blank",
              "noopener,noreferrer"
            );
          } catch (error) {
            fail(error);
          }
        }),

        action("Download", async () => {
          try {
            const url = await signedLink(
              item.file_path,
              true
            );

            window.open(
              url,
              "_blank",
              "noopener,noreferrer"
            );
          } catch (error) {
            fail(error);
          }
        }),

        action(
          "Delete",
          () => deleteMaterial(item),
          "delete-button"
        )
      );

      row.append(icon, main, buttons);
      root.append(row);
    }
  }

  async function deleteMaterial(item) {
    if (!confirm(`Delete file "${item.file_name}"?`)) {
      return;
    }

    await run(async () => {
      const { data, error } = await supabaseClient
        .storage
        .from("study-slides")
        .remove([item.file_path]);

      if (error) throw error;

      if (!data?.some(x => x.name === item.file_path)) {
        throw new Error(
          "Storage deletion was not confirmed."
        );
      }

      await deleteRow(tables.material, item.id);

      notice("Material deleted.");
    });
  }

  // ==========================================
  // DASHBOARD COUNTERS
  // ==========================================

  function render() {
    renderSubjects();
    renderAssignments();
    renderMaterials();
    renderSchedule();

    $("count-subjects").textContent =
      state.subjects.length;

    $("count-assignments").textContent =
      state.assignments.filter(
        item => !item.completed
      ).length;

    $("count-materials").textContent =
      state.materials.length;

    $("count-schedule").textContent =
      state.schedule.filter(
        item =>
          !item.completed &&
          new Date(item.start_time) >= new Date()
      ).length;
  }

  // ==========================================
  // EVENT LISTENERS
  // ==========================================

  function setup() {
    for (const type of [
      "subject",
      "assignment",
      "schedule"
    ]) {
      $(`add-${type}`).addEventListener(
        "click",
        () => {
          resetForm(type);
          toggleForm(type, true);
        }
      );

      document.querySelector(
        `[data-cancel="${type}"]`
      ).addEventListener("click", () => {
        resetForm(type);
        toggleForm(type, false);
      });
    }

    // SAVE SUBJECT
    $("subject-form").addEventListener(
      "submit",
      event => {
        event.preventDefault();

        const payload = {
          name: field("subject-name").trim(),
          subject_code: field("subject-code").trim(),
          semester: field("subject-semester").trim(),
          lecturer: field("subject-lecturer").trim(),
          notes: field("subject-notes").trim()
        };

        if (!payload.name) return;

        run(async () => {
          await saveRow(
            tables.subject,
            payload,
            state.editing.subject
          );

          resetForm("subject");
          toggleForm("subject", false);

          notice("Subject saved.");
        });
      }
    );

    // SAVE ASSIGNMENT
    $("assignment-form").addEventListener(
      "submit",
      event => {
        event.preventDefault();

        const status = field("assignment-status");

        const payload = {
          title: field("assignment-title").trim(),
          subject_id:
            field("assignment-subject") || null,
          due_date:
            field("assignment-date") || null,
          priority: field("assignment-priority"),
          status,
          completed: status === "Completed",
          description:
            field("assignment-description").trim()
        };

        if (!payload.title) return;

        run(async () => {
          await saveRow(
            tables.assignment,
            payload,
            state.editing.assignment
          );

          resetForm("assignment");
          toggleForm("assignment", false);

          notice("Assignment saved.");
        });
      }
    );

    // SAVE SCHEDULE
    $("schedule-form").addEventListener(
      "submit",
      event => {
        event.preventDefault();

        const start = field("schedule-start");
        const end = field("schedule-end");

        if (
          end &&
          new Date(end) < new Date(start)
        ) {
          notice(
            "End time must be after start time.",
            true
          );
          return;
        }

        const payload = {
          title: field("schedule-title").trim(),
          subject_id:
            field("schedule-subject") || null,
          activity_type: field("schedule-type"),
          start_time:
            new Date(start).toISOString(),
          end_time: end
            ? new Date(end).toISOString()
            : null,
          notes: field("schedule-notes").trim()
        };

        if (!payload.title) return;

        run(async () => {
          await saveRow(
            tables.schedule,
            payload,
            state.editing.schedule
          );

          resetForm("schedule");
          toggleForm("schedule", false);

          notice("Schedule saved.");
        });
      }
    );

    // UPLOAD MULTIPLE FILES
    $("material-form").addEventListener(
      "submit",
      event => {
        event.preventDefault();

        const subjectId =
          field("material-subject");

        const files = [
          ...$("material-files").files
        ];

        if (!subjectId) {
          notice(
            "Select a subject before uploading.",
            true
          );
          return;
        }

        if (!files.length) {
          notice(
            "Choose at least one file.",
            true
          );
          return;
        }

        const allowed = new Set([
          "pdf",
          "ppt",
          "pptx",
          "doc",
          "docx"
        ]);

        const invalid = files.some(file => {
          const extension = file.name
            .split(".")
            .pop()
            .toLowerCase();

          return (
            file.size > 20 * 1024 * 1024 ||
            !allowed.has(extension)
          );
        });

        if (invalid) {
          notice(
            "Only PDF/PPT/PPTX/DOC/DOCX " +
            "up to 20 MB per file.",
            true
          );
          return;
        }

        run(async () => {
          let count = 0;

          for (const file of files) {
            const extension = file.name
              .split(".")
              .pop()
              .toLowerCase();

            const path =
              `${state.user.id}/` +
              `${crypto.randomUUID()}.${extension}`;

            const { error: uploadError } =
              await supabaseClient
                .storage
                .from("study-slides")
                .upload(path, file, {
                  upsert: false,
                  contentType:
                    file.type ||
                    "application/octet-stream"
                });

            if (uploadError) {
              throw new Error(
                `${file.name}: ${uploadError.message}`
              );
            }

            try {
              await saveRow(
                tables.material,
                {
                  subject_id: Number(subjectId),
                  title: file.name,
                  file_name: file.name,
                  file_path: path,
                  file_type:
                    file.type || extension,
                  file_size: file.size
                },
                null
              );
            } catch (error) {
              await supabaseClient
                .storage
                .from("study-slides")
                .remove([path]);

              throw error;
            }

            count++;
          }

          $("material-form").reset();

          notice(
            `${count} file(s) uploaded successfully.`
          );
        });
      }
    );
  }

  // ==========================================
  // INITIALIZE STUDY HUB
  // ==========================================

  async function init() {
    try {
      if (typeof supabaseClient === "undefined") {
        throw new Error(
          "supabaseClient not found. " +
          "Check supabase-config.js."
        );
      }

      const { data, error } =
        await supabaseClient.auth.getUser();

      if (error) throw error;

      if (!data?.user) {
        window.location.href = "login.html";
        return;
      }

      state.user = data.user;

      setup();
      await refresh();

      notice("Study Hub is ready.");
    } catch (error) {
      fail(error);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener(
      "DOMContentLoaded",
      init
    );
  } else {
    init();
  }

  window.addEventListener("pageshow", event => {
    if (event.persisted && state.user) {
      refresh().catch(fail);
    }
  });
})();
