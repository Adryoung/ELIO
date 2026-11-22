
/* ==========================================
   ELIO - EXPENSES MODULE
   Supabase Integration
   Add / Edit / Delete / Display
========================================== */

"use strict";

(() => {

  const $ = id => document.getElementById(id);

  const TZ = "Asia/Kuala_Lumpur";

  let currentUser = null;
  let expenses = [];
  let editingId = null;

  const categories = [
    "Grocery",
    "Food",
    "Transport",
    "Bills",
    "Shopping",
    "Entertainment",
    "Other"
  ];

  // ==========================================
  // DATE
  // ==========================================

  function today() {
    const parts = new Intl.DateTimeFormat(
      "en-GB",
      {
        timeZone: TZ,
        year: "numeric",
        month: "2-digit",
        day: "2-digit"
      }
    ).formatToParts(new Date());

    const get = type =>
      parts.find(p => p.type === type)?.value;

    return (
      `${get("year")}-` +
      `${get("month")}-` +
      `${get("day")}`
    );
  }

  function formatDate(value) {
    if (!value) return "";

    const match = String(value).match(
      /^(\d{4})-(\d{2})-(\d{2})$/
    );

    if (!match) return String(value);

    const [, y, m, d] = match;

    return new Date(
      Date.UTC(+y, +m - 1, +d)
    ).toLocaleDateString("en-MY", {
      timeZone: "UTC",
      day: "numeric",
      month: "short",
      year: "numeric"
    });
  }

  function money(value) {
    return "RM " + Number(value || 0).toFixed(2);
  }

  function setText(id, value) {
    const el = $(id);
    if (el) el.textContent = String(value);
  }

  function node(tag, className = "", text) {
    const el = document.createElement(tag);

    if (className) el.className = className;

    if (text !== undefined) {
      el.textContent = String(text);
    }

    return el;
  }

  // ==========================================
  // AUTHENTICATION
  // ==========================================

  async function getUser() {
    if (typeof supabaseClient === "undefined") {
      throw new Error(
        "Supabase configuration not loaded."
      );
    }

    const { data, error } =
      await supabaseClient.auth.getUser();

    if (error) throw error;

    if (!data?.user) {
      throw new Error("Please log in first.");
    }

    return data.user;
  }

  // ==========================================
  // LOAD EXPENSES
  // ==========================================

  async function loadExpenses() {
    if (!currentUser) return;

    const all = [];
    const pageSize = 500;

    for (let offset = 0; ; offset += pageSize) {

      const { data, error } = await supabaseClient
        .from("expenses")
        .select(
          "id,name,amount,category,expense_date,notes,created_at"
        )
        .eq("user_id", currentUser.id)
        .order("expense_date", {
          ascending: false
        })
        .order("created_at", {
          ascending: false
        })
        .range(offset, offset + pageSize - 1);

      if (error) throw error;

      all.push(...(data || []));

      if (!data || data.length < pageSize) {
        break;
      }
    }

    expenses = all;

    renderExpenses();
  }

  // ==========================================
  // SHOW / HIDE FORM
  // ==========================================

  function showForm() {
    $("expense-form")?.classList.remove("hidden");
  }

  function hideForm() {
    $("expense-form")?.classList.add("hidden");
  }

  function resetForm() {
    editingId = null;

    setText("expense-form-title", "Add Expense");

    $("expense-name").value = "";
    $("expense-amount").value = "";
    $("expense-date").value = today();
    $("expense-category").value = "Grocery";
    $("expense-notes").value = "";
  }

  function openAddForm() {
    resetForm();
    showForm();
    $("expense-name")?.focus();
  }

  function openEditForm(id) {
    const item = expenses.find(
      expense => String(expense.id) === String(id)
    );

    if (!item) {
      alert("Expense not found.");
      return;
    }

    editingId = item.id;

    setText("expense-form-title", "Edit Expense");

    $("expense-name").value = item.name || "";
    $("expense-amount").value = item.amount ?? "";
    $("expense-date").value =
      String(item.expense_date || "").slice(0, 10);

    const categorySelect = $("expense-category");

    if (
      !Array.from(categorySelect.options).some(
        option => option.value === item.category
      )
    ) {
      const option = new Option(
        item.category || "Other",
        item.category || "Other"
      );

      categorySelect.add(option);
    }

    categorySelect.value = item.category || "Other";

    $("expense-notes").value = item.notes || "";

    showForm();
    $("expense-name")?.focus();
  }

  // ==========================================
  // SAVE EXPENSE
  // ==========================================

  async function saveExpense() {
    if (!currentUser) {
      alert("Please log in first.");
      return;
    }

    const name = $("expense-name").value.trim();
    const amountInput = $("expense-amount").value;
    const amount = Number(amountInput);
    const date = $("expense-date").value;
    const category = $("expense-category").value;
    const notes = $("expense-notes").value.trim();

    if (!name) {
      alert("Please enter expense name.");
      return;
    }

    if (
      amountInput.trim() === "" ||
      !Number.isFinite(amount) ||
      amount <= 0
    ) {
      alert("Please enter a valid amount above RM 0.");
      return;
    }

    if (!date) {
      alert("Please select expense date.");
      return;
    }

    if (!category) {
      alert("Please select category.");
      return;
    }

    const saveButton = $("save-expense");

    if (saveButton) {
      saveButton.disabled = true;
      saveButton.textContent = "Saving...";
    }

    try {
      const payload = {
        name,
        amount,
        category,
        expense_date: date,
        notes
      };

      let error;

      if (editingId !== null) {

        const result = await supabaseClient
          .from("expenses")
          .update(payload)
          .eq("id", editingId)
          .eq("user_id", currentUser.id)
          .select("id");

        error = result.error;

        if (!error && !result.data?.length) {
          throw new Error(
            "Expense not updated. Check permissions."
          );
        }

      } else {

        const result = await supabaseClient
          .from("expenses")
          .insert({
            ...payload,
            user_id: currentUser.id
          });

        error = result.error;
      }

      if (error) throw error;

      resetForm();
      hideForm();

      await loadExpenses();

    } catch (error) {
      console.error("Save expense error:", error);

      alert(
        "Unable to save expense: " + error.message
      );

    } finally {
      if (saveButton) {
        saveButton.disabled = false;
        saveButton.textContent = "Save Expense";
      }
    }
  }

  // ==========================================
  // DELETE EXPENSE
  // ==========================================

  async function deleteExpense(id) {
    if (!currentUser) return;

    const item = expenses.find(
      expense => String(expense.id) === String(id)
    );

    if (!item) return;

    const confirmed = confirm(
      `Delete "${item.name}"?\n\nThis cannot be undone.`
    );

    if (!confirmed) return;

    try {
      const { data, error } = await supabaseClient
        .from("expenses")
        .delete()
        .eq("id", id)
        .eq("user_id", currentUser.id)
        .select("id");

      if (error) throw error;

      if (!data?.length) {
        throw new Error(
          "Expense not deleted. Check permissions."
        );
      }

      await loadExpenses();

    } catch (error) {
      console.error("Delete expense error:", error);

      alert(
        "Unable to delete expense: " + error.message
      );
    }
  }

  // ==========================================
  // SUMMARY
  // ==========================================

  function renderSummary() {
    const currentDate = today();
    const currentMonth = currentDate.slice(0, 7);

    let monthly = 0;
    let daily = 0;

    expenses.forEach(item => {
      const amount = Number(item.amount || 0);
      const date = String(item.expense_date || "");

      if (date.slice(0, 7) === currentMonth) {
        monthly += amount;
      }

      if (date.slice(0, 10) === currentDate) {
        daily += amount;
      }
    });

    setText(
      "monthly-expense-total",
      money(monthly)
    );

    setText(
      "today-expense-total",
      money(daily)
    );

    setText(
      "expense-transaction-count",
      expenses.length
    );
  }

  // ==========================================
  // CATEGORY TOTALS
  // ==========================================

  function renderCategories() {
    const currentMonth = today().slice(0, 7);

    const totals = {};

    categories.forEach(category => {
      totals[category] = 0;
    });

    expenses.forEach(item => {
      const date = String(item.expense_date || "");

      if (date.slice(0, 7) !== currentMonth) {
        return;
      }

      const category = item.category || "Other";

      if (totals[category] === undefined) {
        totals[category] = 0;
      }

      totals[category] += Number(item.amount || 0);
    });

    setText(
      "category-grocery-total",
      money(totals.Grocery)
    );

    setText(
      "category-food-total",
      money(totals.Food)
    );

    setText(
      "category-transport-total",
      money(totals.Transport)
    );

    setText(
      "category-bills-total",
      money(totals.Bills)
    );
  }

  // ==========================================
  // TRANSACTION LIST
  // ==========================================

  function renderTransactions() {
    const container = $("expense-list");

    if (!container) return;

    container.replaceChildren();

    setText(
      "expense-list-count",
      `${expenses.length} ${
        expenses.length === 1
          ? "Entry"
          : "Entries"
      }`
    );

    if (!expenses.length) {
      container.append(
        node(
          "p",
          "empty-state",
          "No expenses recorded yet."
        )
      );

      return;
    }

    expenses.forEach(item => {
      const row = node("div", "expense-item");

      const info = node("div", "expense-info");

      const name = node(
        "h3",
        "",
        item.name || "Untitled Expense"
      );

      const meta = node(
        "p",
        "expense-meta",
        `${item.category || "Other"} · ${
          formatDate(item.expense_date)
        }`
      );

      info.append(name, meta);

      if (item.notes) {
        info.append(
          node("p", "expense-notes", item.notes)
        );
      }

      const right = node(
        "div",
        "expense-item-actions"
      );

      const amount = node(
        "strong",
        "expense-amount",
        money(item.amount)
      );

      const buttons = node(
        "div",
        "expense-actions"
      );

      const editButton = node(
        "button",
        "secondary-button",
        "Edit"
      );

      editButton.type = "button";

      editButton.addEventListener(
        "click",
        () => openEditForm(item.id)
      );

      const deleteButton = node(
        "button",
        "secondary-button",
        "Delete"
      );

      deleteButton.type = "button";

      deleteButton.addEventListener(
        "click",
        () => deleteExpense(item.id)
      );

      buttons.append(
        editButton,
        deleteButton
      );

      right.append(
        amount,
        buttons
      );

      row.append(info, right);

      container.append(row);
    });
  }

  // ==========================================
  // RENDER ALL
  // ==========================================

  function renderExpenses() {
    renderSummary();
    renderCategories();
    renderTransactions();
  }

  // ==========================================
  // INITIALIZATION
  // ==========================================

  async function initializeExpenses() {
    if (
      !$("expense-list") ||
      !$("save-expense") ||
      !$("expense-form")
    ) {
      return;
    }

    $("show-expense-form")?.addEventListener(
      "click",
      openAddForm
    );

    $("cancel-expense")?.addEventListener(
      "click",
      () => {
        resetForm();
        hideForm();
      }
    );

    $("save-expense")?.addEventListener(
      "click",
      saveExpense
    );

    resetForm();

    try {
      currentUser = await getUser();
      await loadExpenses();

      console.log(
        "ELIO Expenses loaded successfully"
      );

    } catch (error) {
      console.error(
        "ELIO Expenses initialization error:",
        error
      );

      const container = $("expense-list");

      if (container) {
        container.replaceChildren(
          node(
            "p",
            "empty-state",
            "Unable to load expenses. Check login and Supabase."
          )
        );
      }
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener(
      "DOMContentLoaded",
      initializeExpenses
    );
  } else {
    initializeExpenses();
  }

  window.addEventListener(
    "pageshow",
    event => {
      if (event.persisted && currentUser) {
        loadExpenses().catch(console.error);
      }
    }
  );

})();
