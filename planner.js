
/* ==========================================
   ELIO - PLANNER MODULE
   Supabase Integration

   Modules:
   1. Planner
   2. Work Tasks
   3. Personal Tasks
   4. Study Assignments
   5. Study Schedule

   Study Hub records are read directly
   from their original Supabase tables.
   No duplicate records are created.
========================================== */

"use strict";

/* ==========================================
   GLOBAL DATA
========================================== */

let plannerPlans = [];
let plannerWorkTasks = [];
let plannerPersonalTasks = [];
let plannerStudyAssignments = [];
let plannerStudySchedule = [];

let editingPlanId = null;
let currentUser = null;
let plannerBusy = false;

const today = new Date();

let displayedYear = today.getFullYear();
let displayedMonth = today.getMonth();
let selectedDate = formatLocalDate(today);

/* ==========================================
   ELEMENTS
========================================== */

const showPlanForm =
    document.getElementById("show-plan-form");

const planForm =
    document.getElementById("plan-form");

const planFormTitle =
    document.getElementById("plan-form-title");

const planName =
    document.getElementById("plan-name");

const planDate =
    document.getElementById("plan-date");

const planType =
    document.getElementById("plan-type");

const planNotes =
    document.getElementById("plan-notes");

const cancelPlan =
    document.getElementById("cancel-plan");

const savePlanButton =
    document.getElementById("save-plan");

const calendarMonthTitle =
    document.getElementById("calendar-month-title");

const calendarGrid =
    document.getElementById("calendar-grid");

const previousMonth =
    document.getElementById("previous-month");

const nextMonth =
    document.getElementById("next-month");

const selectedDateTitle =
    document.getElementById("selected-date-title");

const selectedDateCount =
    document.getElementById("selected-date-count");

const selectedDateList =
    document.getElementById("selected-date-list");

const plannerUpcomingCount =
    document.getElementById("planner-upcoming-count");

const plannerMonthCount =
    document.getElementById("planner-month-count");

const plannerTodayCount =
    document.getElementById("planner-today-count");

const planList =
    document.getElementById("plan-list");

const planListCount =
    document.getElementById("plan-list-count");

/* ==========================================
   DATE HELPERS
========================================== */

function formatLocalDate(date) {
    const year = date.getFullYear();

    const month = String(
        date.getMonth() + 1
    ).padStart(2, "0");

    const day = String(
        date.getDate()
    ).padStart(2, "0");

    return `${year}-${month}-${day}`;
}

function getTodayDate() {
    return formatLocalDate(new Date());
}

function parseLocalDate(dateString) {
    if (!dateString) return null;

    const parts = String(dateString)
        .split("-")
        .map(Number);

    if (parts.length !== 3) return null;

    const [year, month, day] = parts;

    if (!year || !month || !day) return null;

    const date = new Date(
        year,
        month - 1,
        day
    );

    if (
        date.getFullYear() !== year ||
        date.getMonth() !== month - 1 ||
        date.getDate() !== day
    ) {
        return null;
    }

    return date;
}

function formatDisplayDate(dateString) {
    const date = parseLocalDate(dateString);

    if (!date) return "";

    return date.toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric"
    });
}

/* Convert TIMESTAMPTZ to Malaysia date */

function studyDateInMalaysia(value) {
    if (!value) return "";

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
        return "";
    }

    const parts = new Intl.DateTimeFormat(
        "en-GB",
        {
            timeZone: "Asia/Kuala_Lumpur",
            year: "numeric",
            month: "2-digit",
            day: "2-digit"
        }
    ).formatToParts(date);

    const get = type =>
        parts.find(
            part => part.type === type
        )?.value;

    return (
        `${get("year")}-` +
        `${get("month")}-` +
        `${get("day")}`
    );
}

function studyTimeInMalaysia(value) {
    if (!value) return "";

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
        return "";
    }

    return new Intl.DateTimeFormat(
        "en-GB",
        {
            timeZone: "Asia/Kuala_Lumpur",
            hour: "2-digit",
            minute: "2-digit",
            hourCycle: "h23"
        }
    ).format(date);
}

/* ==========================================
   AUTHENTICATION
========================================== */

async function getCurrentUser() {
    if (
        typeof supabaseClient === "undefined"
    ) {
        throw new Error(
            "Supabase configuration not loaded."
        );
    }

    const { data, error } =
        await supabaseClient.auth.getUser();

    if (error) throw error;

    return data?.user || null;
}

/* ==========================================
   LOAD ALL RECORDS
   Supports more than 1000 records
========================================== */

async function loadAllRows(
    table,
    userId,
    orderColumn = "id"
) {
    const results = [];
    const pageSize = 500;

    for (
        let offset = 0;
        ;
        offset += pageSize
    ) {
        const { data, error } =
            await supabaseClient
                .from(table)
                .select("*")
                .eq("user_id", userId)
                .order(orderColumn, {
                    ascending: true
                })
                .range(
                    offset,
                    offset + pageSize - 1
                );

        if (error) throw error;

        results.push(...(data || []));

        if (
            !data ||
            data.length < pageSize
        ) {
            break;
        }
    }

    return results;
}

/* ==========================================
   LOAD PLANNER + WORK + PERSONAL + STUDY
========================================== */

async function loadPlannerData() {
    try {
        if (!currentUser) {
            currentUser =
                await getCurrentUser();
        }

        if (!currentUser) {
            window.location.replace(
                "login.html"
            );
            return;
        }

        const userId = currentUser.id;

        const [
            plans,
            work,
            personal,
            assignments,
            schedule
        ] = await Promise.all([
            loadAllRows(
                "planner_plans",
                userId
            ),

            loadAllRows(
                "work_tasks",
                userId
            ),

            loadAllRows(
                "personal_tasks",
                userId
            ),

            loadAllRows(
                "study_assignments",
                userId
            ),

            loadAllRows(
                "study_schedule",
                userId
            )
        ]);

        plannerPlans = plans;
        plannerWorkTasks = work;
        plannerPersonalTasks = personal;
        plannerStudyAssignments = assignments;
        plannerStudySchedule = schedule;

        renderPlanner();

        console.log(
            "ELIO Planner loaded:",
            {
                plans: plans.length,
                work: work.length,
                personal: personal.length,
                assignments: assignments.length,
                schedule: schedule.length
            }
        );

    } catch (error) {
        console.error(
            "Planner loading error:",
            error
        );

        alert(
            "Unable to load Planner data: " +
            (error.message || String(error))
        );
    }
}

/* ==========================================
   COMBINE CALENDAR ITEMS
========================================== */

function getCalendarItems() {

    /* PLANNER */

    const plans = plannerPlans
        .filter(plan => plan.date)
        .map(plan => ({
            id: plan.id,
            name: plan.name,
            date: plan.date,
            type: plan.type || "Personal",
            notes: plan.notes || "",
            source: "planner",
            completed:
                Boolean(plan.completed)
        }));

    /* WORK */

    const workTasks = plannerWorkTasks
        .filter(task => task.due_date)
        .map(task => ({
            id: task.id,
            name: task.name,
            date: task.due_date,
            type: "Work",
            notes: task.notes || "",
            source: "work",
            completed:
                Boolean(task.completed)
        }));

    /* PERSONAL */

    const personalTasks =
        plannerPersonalTasks
            .filter(task => task.due_date)
            .map(task => ({
                id: task.id,
                name: task.name,
                date: task.due_date,
                type: "Personal",
                notes: task.notes || "",
                source: "personal",
                completed:
                    Boolean(task.completed)
            }));

    /* STUDY ASSIGNMENTS */

    const assignments =
        plannerStudyAssignments
            .filter(item => item.due_date)
            .map(item => ({
                id: item.id,
                name: item.title,
                date: item.due_date,
                type: "Assignment",
                notes:
                    item.description || "",
                source: "study-assignment",
                priority:
                    item.priority || "Medium",
                status:
                    item.status || "Not Started",
                completed:
                    Boolean(item.completed) ||
                    item.status === "Completed"
            }));

    /* STUDY SCHEDULE */

    const schedules =
        plannerStudySchedule
            .filter(item => item.start_time)
            .map(item => ({
                id: item.id,
                name: item.title,
                date: studyDateInMalaysia(
                    item.start_time
                ),
                type:
                    item.activity_type ||
                    "Study",
                notes: item.notes || "",
                source: "study-schedule",
                startTime:
                    studyTimeInMalaysia(
                        item.start_time
                    ),
                endTime:
                    studyTimeInMalaysia(
                        item.end_time
                    ),
                completed:
                    Boolean(item.completed)
            }));

    return [
        ...plans,
        ...workTasks,
        ...personalTasks,
        ...assignments,
        ...schedules
    ];
}

/* ==========================================
   RESET FORM
========================================== */

function resetPlanForm() {
    editingPlanId = null;

    planName.value = "";
    planDate.value = selectedDate;
    planType.value = "Personal";
    planNotes.value = "";

    planFormTitle.textContent =
        "Add Plan";

    savePlanButton.textContent =
        "Add Plan";
}

/* ==========================================
   SHOW / CLOSE FORM
========================================== */

function openPlanForm() {
    if (plannerBusy) return;

    resetPlanForm();

    planForm.classList.remove(
        "hidden"
    );

    planName.focus();
}

function closePlanForm() {
    if (plannerBusy) return;

    resetPlanForm();

    planForm.classList.add(
        "hidden"
    );
}

/* ==========================================
   SAVE PLAN
========================================== */

async function savePlan() {
    if (plannerBusy) return;

    const name = planName.value.trim();
    const date = planDate.value;
    const type = planType.value;
    const notes = planNotes.value.trim();

    if (!name) {
        alert(
            "Please enter a plan name."
        );

        planName.focus();
        return;
    }

    if (!date) {
        alert(
            "Please select a date."
        );

        planDate.focus();
        return;
    }

    if (!currentUser) {
        alert(
            "Please login again."
        );
        return;
    }

    plannerBusy = true;
    savePlanButton.disabled = true;

    try {
        const payload = {
            name,
            date,
            type,
            notes
        };

        let result;

        if (editingPlanId === null) {

            /* ADD NEW PLAN */

            result = await supabaseClient
                .from("planner_plans")
                .insert({
                    ...payload,
                    user_id: currentUser.id
                })
                .select("id");

        } else {

            /* UPDATE EXISTING PLAN */

            result = await supabaseClient
                .from("planner_plans")
                .update(payload)
                .eq(
                    "id",
                    editingPlanId
                )
                .eq(
                    "user_id",
                    currentUser.id
                )
                .select("id");
        }

        if (result.error) {
            throw result.error;
        }

        if (!result.data?.length) {
            throw new Error(
                "No plan was saved."
            );
        }

        selectedDate = date;

        const selected =
            parseLocalDate(date);

        if (selected) {
            displayedYear =
                selected.getFullYear();

            displayedMonth =
                selected.getMonth();
        }

        editingPlanId = null;

        planForm.classList.add(
            "hidden"
        );

        await loadPlannerData();

    } catch (error) {
        console.error(
            "Save plan error:",
            error
        );

        alert(
            "Unable to save plan: " +
            (error.message || String(error))
        );

    } finally {
        plannerBusy = false;
        savePlanButton.disabled = false;
    }
}

/* ==========================================
   EDIT PLAN
========================================== */

function editPlan(planId) {
    if (plannerBusy) return;

    const plan = plannerPlans.find(
        item =>
            String(item.id) ===
            String(planId)
    );

    if (!plan) return;

    editingPlanId = plan.id;

    planName.value =
        plan.name || "";

    planDate.value =
        plan.date || "";

    planType.value =
        plan.type || "Personal";

    planNotes.value =
        plan.notes || "";

    planFormTitle.textContent =
        "Edit Plan";

    savePlanButton.textContent =
        "Save Changes";

    planForm.classList.remove(
        "hidden"
    );

    planForm.scrollIntoView({
        behavior: "smooth",
        block: "start"
    });

    planName.focus();
}

/* ==========================================
   DELETE PLAN
========================================== */

async function deletePlan(planId) {
    if (plannerBusy) return;

    const plan = plannerPlans.find(
        item =>
            String(item.id) ===
            String(planId)
    );

    if (!plan) return;

    const confirmed = confirm(
        `Delete "${plan.name}"?`
    );

    if (!confirmed) return;

    plannerBusy = true;

    try {
        const { data, error } =
            await supabaseClient
                .from("planner_plans")
                .delete()
                .eq("id", plan.id)
                .eq(
                    "user_id",
                    currentUser.id
                )
                .select("id");

        if (error) throw error;

        if (!data?.length) {
            throw new Error(
                "Plan not found or delete not permitted."
            );
        }

        if (
            editingPlanId !== null &&
            String(editingPlanId) ===
            String(planId)
        ) {
            editingPlanId = null;

            planForm.classList.add(
                "hidden"
            );
        }

        await loadPlannerData();

    } catch (error) {
        console.error(
            "Delete plan error:",
            error
        );

        alert(
            "Unable to delete plan: " +
            (error.message || String(error))
        );

    } finally {
        plannerBusy = false;
    }
}

/* ==========================================
   SUMMARY COUNTERS
========================================== */

function updatePlannerCounters() {
    const items = getCalendarItems();

    const todayString =
        getTodayDate();

    const monthPrefix =
        `${displayedYear}-` +
        String(
            displayedMonth + 1
        ).padStart(2, "0");

    if (plannerUpcomingCount) {
        plannerUpcomingCount.textContent =
            items.filter(item =>
                item.date >= todayString &&
                !item.completed
            ).length;
    }

    if (plannerMonthCount) {
        plannerMonthCount.textContent =
            items.filter(item =>
                item.date &&
                item.date.startsWith(
                    monthPrefix
                )
            ).length;
    }

    if (plannerTodayCount) {
        plannerTodayCount.textContent =
            items.filter(item =>
                item.date === todayString &&
                !item.completed
            ).length;
    }
}

/* ==========================================
   CALENDAR
========================================== */

function renderCalendar() {
    if (!calendarGrid) return;

    calendarGrid.replaceChildren();

    const firstDay = new Date(
        displayedYear,
        displayedMonth,
        1
    );

    const daysInMonth = new Date(
        displayedYear,
        displayedMonth + 1,
        0
    ).getDate();

    const startingDay =
        firstDay.getDay();

    const items =
        getCalendarItems();

    if (calendarMonthTitle) {
        calendarMonthTitle.textContent =
            firstDay.toLocaleDateString(
                "en-GB",
                {
                    month: "long",
                    year: "numeric"
                }
            );
    }

    const weekdays = [
        "Sun",
        "Mon",
        "Tue",
        "Wed",
        "Thu",
        "Fri",
        "Sat"
    ];

    weekdays.forEach(day => {
        const heading =
            document.createElement(
                "div"
            );

        heading.className =
            "calendar-weekday";

        heading.textContent = day;

        calendarGrid.appendChild(
            heading
        );
    });

    /* EMPTY DAYS */

    for (
        let i = 0;
        i < startingDay;
        i++
    ) {
        const empty =
            document.createElement(
                "div"
            );

        empty.className =
            "calendar-empty";

        calendarGrid.appendChild(
            empty
        );
    }

    /* CALENDAR DAYS */

    for (
        let day = 1;
        day <= daysInMonth;
        day++
    ) {
        const dateString =
            formatLocalDate(
                new Date(
                    displayedYear,
                    displayedMonth,
                    day
                )
            );

        const dayItems =
            items.filter(
                item =>
                    item.date === dateString
            );

        const cell =
            document.createElement(
                "button"
            );

        cell.type = "button";
        cell.className =
            "calendar-day";

        if (
            dateString ===
            getTodayDate()
        ) {
            cell.classList.add(
                "today"
            );
        }

        if (
            dateString ===
            selectedDate
        ) {
            cell.classList.add(
                "selected"
            );
        }

        const number =
            document.createElement(
                "span"
            );

        number.className =
            "calendar-day-number";

        number.textContent = day;

        cell.appendChild(number);

        /* EVENT COUNT */

        if (dayItems.length > 0) {
            const indicator =
                document.createElement(
                    "span"
                );

            indicator.className =
                "calendar-event-count";

            indicator.textContent =
                `${dayItems.length} item` +
                (dayItems.length > 1
                    ? "s"
                    : "");

            cell.appendChild(
                indicator
            );
        }

        cell.addEventListener(
            "click",
            () => {
                selectedDate =
                    dateString;

                renderCalendar();
                renderSelectedDate();
            }
        );

        calendarGrid.appendChild(
            cell
        );
    }
}

/* ==========================================
   SOURCE LABELS
========================================== */

function getSourceLabel(source) {
    switch (source) {
        case "planner":
            return "Planner";

        case "work":
            return "Work Task";

        case "personal":
            return "Personal Task";

        case "study-assignment":
            return "Study Hub - Assignment";

        case "study-schedule":
            return "Study Hub - Schedule";

        default:
            return "Other";
    }
}

/* ==========================================
   CREATE ITEM ELEMENT
========================================== */

function createItemElement(
    item,
    allowActions = false
) {
    const element =
        document.createElement(
            "div"
        );

    element.className =
        "task-item";

    if (item.completed) {
        element.classList.add(
            "completed"
        );
    }

    /* DETAILS */

    const details =
        document.createElement(
            "div"
        );

    details.className =
        "task-details";

    const heading =
        document.createElement(
            "h3"
        );

    heading.textContent =
        item.name || "Untitled";

    const meta =
        document.createElement(
            "div"
        );

    meta.className =
        "task-meta";

    /* DATE */

    const dateSpan =
        document.createElement(
            "span"
        );

    dateSpan.textContent =
        formatDisplayDate(
            item.date
        );

    meta.appendChild(
        dateSpan
    );

    /* TYPE BADGE */

    const typeSpan =
        document.createElement(
            "span"
        );

    typeSpan.className =
        "badge";

    typeSpan.textContent =
        item.type || "Other";

    meta.appendChild(
        typeSpan
    );

    /* SOURCE */

    const sourceSpan =
        document.createElement(
            "span"
        );

    sourceSpan.textContent =
        getSourceLabel(
            item.source
        );

    meta.appendChild(
        sourceSpan
    );

    /* STUDY SCHEDULE TIME */

    if (
        item.source ===
        "study-schedule"
    ) {
        const timeSpan =
            document.createElement(
                "span"
            );

        const start =
            item.startTime || "";

        const end =
            item.endTime || "";

        timeSpan.textContent =
            start && end
                ? `${start} - ${end}`
                : start;

        meta.appendChild(
            timeSpan
        );
    }

    /* ASSIGNMENT PRIORITY */

    if (
        item.source ===
        "study-assignment"
    ) {
        const prioritySpan =
            document.createElement(
                "span"
            );

        prioritySpan.className =
            "badge";

        prioritySpan.textContent =
            item.priority || "Medium";

        meta.appendChild(
            prioritySpan
        );

        const statusSpan =
            document.createElement(
                "span"
            );

        statusSpan.textContent =
            item.status || "Not Started";

        meta.appendChild(
            statusSpan
        );
    }

    /* COMPLETED */

    if (item.completed) {
        const completedSpan =
            document.createElement(
                "span"
            );

        completedSpan.className =
            "badge";

        completedSpan.textContent =
            "Completed";

        meta.appendChild(
            completedSpan
        );
    }

    details.appendChild(
        heading
    );

    details.appendChild(
        meta
    );

    /* NOTES */

    if (item.notes) {
        const notes =
            document.createElement(
                "p"
            );

        notes.className =
            "task-notes";

        notes.textContent =
            item.notes;

        details.appendChild(
            notes
        );
    }

    element.appendChild(
        details
    );

    /* PLANNER ACTIONS ONLY */

    if (
        allowActions &&
        item.source === "planner"
    ) {
        const actions =
            document.createElement(
                "div"
            );

        actions.className =
            "task-actions";

        const editButton =
            document.createElement(
                "button"
            );

        editButton.type =
            "button";

        editButton.className =
            "edit-button";

        editButton.textContent =
            "Edit";

        editButton.addEventListener(
            "click",
            () => editPlan(item.id)
        );

        const deleteButton =
            document.createElement(
                "button"
            );

        deleteButton.type =
            "button";

        deleteButton.className =
            "delete-button";

        deleteButton.textContent =
            "Delete";

        deleteButton.addEventListener(
            "click",
            () => deletePlan(item.id)
        );

        actions.append(
            editButton,
            deleteButton
        );

        element.appendChild(
            actions
        );
    }

    return element;
}

/* ==========================================
   SELECTED DATE ITEMS
========================================== */

function renderSelectedDate() {
    if (!selectedDateList) return;

    const items =
        getCalendarItems()
            .filter(
                item =>
                    item.date === selectedDate
            )
            .sort((a, b) =>
                String(a.name || "")
                    .localeCompare(
                        String(b.name || "")
                    )
            );

    if (selectedDateTitle) {
        selectedDateTitle.textContent =
            formatDisplayDate(
                selectedDate
            );
    }

    if (selectedDateCount) {
        selectedDateCount.textContent =
            `${items.length} Item` +
            (items.length !== 1
                ? "s"
                : "");
    }

    selectedDateList.replaceChildren();

    if (items.length === 0) {
        const empty =
            document.createElement(
                "div"
            );

        empty.className =
            "empty-state";

        const title =
            document.createElement(
                "h3"
            );

        title.textContent =
            "No plans or tasks";

        const description =
            document.createElement(
                "p"
            );

        description.textContent =
            "Nothing scheduled for this date.";

        empty.append(
            title,
            description
        );

        selectedDateList.appendChild(
            empty
        );

        return;
    }

    items.forEach(item => {
        selectedDateList.appendChild(
            createItemElement(
                item,
                item.source === "planner"
            )
        );
    });
}

/* ==========================================
   ALL PLANS
========================================== */

function renderPlanList() {
    if (!planList) return;

    planList.replaceChildren();

    const sortedPlans =
        [...plannerPlans]
            .filter(plan => plan.date)
            .sort((a, b) =>
                a.date.localeCompare(
                    b.date
                )
            );

    if (planListCount) {
        planListCount.textContent =
            `${sortedPlans.length} Plan` +
            (sortedPlans.length !== 1
                ? "s"
                : "");
    }

    if (
        sortedPlans.length === 0
    ) {
        const empty =
            document.createElement(
                "div"
            );

        empty.className =
            "empty-state";

        const title =
            document.createElement(
                "h3"
            );

        title.textContent =
            "No plans yet";

        const description =
            document.createElement(
                "p"
            );

        description.textContent =
            "Click + Add Plan to create your first plan.";

        empty.append(
            title,
            description
        );

        planList.appendChild(
            empty
        );

        return;
    }

    sortedPlans.forEach(plan => {
        planList.appendChild(
            createItemElement(
                {
                    ...plan,
                    source: "planner",
                    completed:
                        Boolean(plan.completed)
                },
                true
            )
        );
    });
}

/* ==========================================
   RENDER EVERYTHING
========================================== */

function renderPlanner() {
    updatePlannerCounters();
    renderCalendar();
    renderSelectedDate();
    renderPlanList();
}

/* ==========================================
   EVENT LISTENERS
========================================== */

if (showPlanForm) {
    showPlanForm.addEventListener(
        "click",
        openPlanForm
    );
}

if (cancelPlan) {
    cancelPlan.addEventListener(
        "click",
        closePlanForm
    );
}

if (savePlanButton) {
    savePlanButton.addEventListener(
        "click",
        savePlan
    );
}

/* PREVIOUS MONTH */

if (previousMonth) {
    previousMonth.addEventListener(
        "click",
        () => {
            displayedMonth--;

            if (
                displayedMonth < 0
            ) {
                displayedMonth = 11;
                displayedYear--;
            }

            renderCalendar();
            updatePlannerCounters();
        }
    );
}

/* NEXT MONTH */

if (nextMonth) {
    nextMonth.addEventListener(
        "click",
        () => {
            displayedMonth++;

            if (
                displayedMonth > 11
            ) {
                displayedMonth = 0;
                displayedYear++;
            }

            renderCalendar();
            updatePlannerCounters();
        }
    );
}

/* ==========================================
   INITIALIZE
========================================== */

async function initializePlanner() {
    console.log(
        "ELIO Planner initializing..."
    );

    if (
        typeof supabaseClient ===
        "undefined"
    ) {
        console.error(
            "Supabase client not found."
        );

        alert(
            "Supabase configuration is missing."
        );

        return;
    }

    if (
        !planForm ||
        !planName ||
        !planDate ||
        !planType ||
        !planNotes ||
        !calendarGrid ||
        !selectedDateList ||
        !planList
    ) {
        console.error(
            "Planner HTML elements are missing."
        );

        return;
    }

    resetPlanForm();

    await loadPlannerData();
}

if (
    document.readyState ===
    "loading"
) {
    document.addEventListener(
        "DOMContentLoaded",
        initializePlanner
    );
} else {
    initializePlanner();
}
