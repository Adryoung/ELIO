
/* Mellynna OS Smart Inbox: Supabase routing and capture history */
(() => {
  'use strict';

  const $ = id => document.getElementById(id);

  const labels = {
    work: 'Work',
    personal: 'Personal',
    planner: 'Planner',
    grocery: 'Grocery',
    expense: 'Expense',
    meal: 'Meal'
  };

  const input = $('smart-input');
  const counter = $('character-count');
  const continueButton = $('analyse-button');
  const routingCard = $('routing-card');
  const cards = [...document.querySelectorAll('.destination-card')];
  const selectedArea = $('selected-area');
  const selectedText = $('selected-destination');
  const sendButton = $('save-smart-item');
  const recentArea = $('recent-captures');

  let selected = null;
  let currentUser = null;
  let sending = false;

  /* DATE HELPERS */

  function dateKey(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  }

  function validDate(year, month, day) {
    const date = new Date(year, month - 1, day);

    return date.getFullYear() === year &&
      date.getMonth() === month - 1 &&
      date.getDate() === day;
  }

  function detectDate(text) {
    const iso = text.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);

    if (iso) {
      const [y, m, d] = iso.slice(1).map(Number);

      if (validDate(y, m, d)) return iso[0];

      throw new Error('Invalid date. Use a valid YYYY-MM-DD date.');
    }

    const dmy = text.match(/\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/);

    if (dmy) {
      const [d, m, y] = dmy.slice(1).map(Number);

      if (validDate(y, m, d)) {
        return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      }

      throw new Error('Invalid date. Use a valid DD/MM/YYYY date.');
    }

    if (/\b(tomorrow|esok)\b/i.test(text)) {
      const d = new Date();
      d.setDate(d.getDate() + 1);
      return dateKey(d);
    }

    if (/\b(today|hari ini)\b/i.test(text)) {
      return dateKey(new Date());
    }

    return null;
  }

  /* AMOUNT DETECTION */

  function detectAmount(text) {
    // Require RM so that dates are not mistaken for amounts.
    const money = text.match(/\bRM\s*([\d,]+(?:\.\d{1,2})?)\b/i);

    if (!money) return null;

    const amount = Number(money[1].replace(/,/g, ''));

    return Number.isFinite(amount) && amount > 0
      ? amount
      : null;
  }

  /* CATEGORY DETECTION */

  function personalCategory(text) {
    if (/\b(buy|beli|shopping)\b/i.test(text)) {
      return 'Shopping';
    }

    if (/\b(family|keluarga)\b/i.test(text)) {
      return 'Family';
    }

    if (/\b(friend|friends|kawan)\b/i.test(text)) {
      return 'Friends';
    }

    return 'Other';
  }

  function expenseCategory(text) {
    if (/\b(grocery|groceries|barang dapur)\b/i.test(text)) {
      return 'Grocery';
    }

    if (/\b(food|lunch|dinner|makan)\b/i.test(text)) {
      return 'Food';
    }

    if (/\b(petrol|grab|transport|parking)\b/i.test(text)) {
      return 'Transport';
    }

    if (/\b(bill|internet|electric|water)\b/i.test(text)) {
      return 'Bills';
    }

    return 'Other';
  }

  /* SUPABASE HELPERS */

  async function getUser() {
    const { data, error } = await supabaseClient.auth.getUser();

    if (error) throw error;

    return data.user;
  }

  async function insert(table, row) {
    const { error } = await supabaseClient
      .from(table)
      .insert(row);

    if (error) throw error;
  }

  /* ROUTING */

  async function route(user, destination, text) {
    const user_id = user.id;
    const detectedDate = detectDate(text);

    switch (destination) {

      case 'work':
        return insert('work_tasks', {
          user_id,
          name: text,
          due_date: detectedDate,
          notes: 'Added from Smart Inbox',
          completed: false
        });

      case 'personal':
        return insert('personal_tasks', {
          user_id,
          name: text,
          due_date: detectedDate,
          category: personalCategory(text),
          notes: 'Added from Smart Inbox',
          completed: false
        });

      case 'planner':
        return insert('planner_plans', {
          user_id,
          name: text,
          date: detectedDate || dateKey(new Date()),
          type: 'Personal',
          notes: 'Added from Smart Inbox'
        });

      case 'grocery':
        return insert('grocery_items', {
          user_id,
          name: text,
          category: 'Other',
          quantity: null,
          purchased: false
        });

      case 'expense': {
        const amount = detectAmount(text);

        if (amount === null) {
          throw new Error(
            'For expenses, include an amount such as RM25.50.'
          );
        }

        return insert('expenses', {
          user_id,
          name: text,
          amount,
          category: expenseCategory(text),
          expense_date: detectedDate || dateKey(new Date()),
          notes: 'Added from Smart Inbox'
        });
      }

      case 'meal':
        return insert('meals', {
          user_id,
          day: detectedDate || dateKey(new Date()),
          name: text,
          notes: 'Added from Smart Inbox'
        });

      default:
        throw new Error('Please choose a destination.');
    }
  }

  /* EMPTY RECENT CAPTURES */

  function emptyCaptures(
    message = 'Capture something above to get started.'
  ) {
    recentArea.replaceChildren();

    const wrapper = document.createElement('div');
    wrapper.className = 'empty-state';

    const icon = document.createElement('span');
    icon.textContent = '✨';

    const heading = document.createElement('h3');
    heading.textContent = 'Your inbox is clear';

    const description = document.createElement('p');
    description.textContent = message;

    wrapper.append(icon, heading, description);
    recentArea.append(wrapper);
  }

  /* LOAD RECENT CAPTURES FROM SUPABASE */

  async function renderRecentCaptures() {
    if (!currentUser) return;

    const { data, error } = await supabaseClient
      .from('smart_inbox_captures')
      .select('id,content,destination,created_at')
      .eq('user_id', currentUser.id)
      .order('created_at', { ascending: false })
      .limit(10);

    if (error) throw error;

    recentArea.replaceChildren();

    if (!data?.length) {
      emptyCaptures();
      return;
    }

    for (const capture of data) {
      const item = document.createElement('div');
      item.className = 'capture-item';

      const content = document.createElement('div');
      content.className = 'capture-content';

      const heading = document.createElement('h3');
      heading.textContent = capture.content;

      const description = document.createElement('p');
      description.textContent =
        `Sent to ${labels[capture.destination] || capture.destination}`;

      content.append(heading, description);

      const time = document.createElement('small');
      time.textContent = new Date(
        capture.created_at
      ).toLocaleString('en-MY');

      item.append(content, time);
      recentArea.append(item);
    }
  }

  /* RESET FORM */

  function resetForm() {
    input.value = '';
    counter.textContent = '0 / 500';
    selected = null;

    cards.forEach(card => {
      card.classList.remove('selected');
    });

    selectedArea.classList.add('hidden');
    routingCard.classList.add('hidden');

    sendButton.textContent = 'Send →';
  }

  /* CHARACTER COUNTER */

  input.addEventListener('input', () => {
    counter.textContent = `${input.value.length} / 500`;
  });

  /* CONTINUE BUTTON */

  continueButton.addEventListener('click', () => {
    if (!input.value.trim()) {
      alert('Write something first.');
      input.focus();
      return;
    }

    routingCard.classList.remove('hidden');

    routingCard.scrollIntoView({
      behavior: 'smooth',
      block: 'start'
    });
  });

  /* SELECT DESTINATION */

  cards.forEach(card => {
    card.addEventListener('click', () => {
      const value = card.dataset.destination;

      if (!labels[value]) return;

      selected = value;

      cards.forEach(c => {
        c.classList.toggle('selected', c === card);
      });

      selectedText.textContent = labels[value];

      sendButton.textContent =
        `Send to ${labels[value]} →`;

      selectedArea.classList.remove('hidden');
    });
  });

  /* SEND SMART ITEM */

  sendButton.addEventListener('click', async () => {
    if (sending) return;

    const text = input.value.trim();

    if (!text || !selected) {
      alert('Enter text and choose a destination.');
      return;
    }

    sending = true;
    sendButton.disabled = true;
    sendButton.textContent = 'Sending...';

    let routed = false;

    try {
      currentUser = await getUser();

      if (!currentUser) {
        window.location.replace('login.html');
        return;
      }

      // Save item to selected module.
      await route(currentUser, selected, text);
      routed = true;

      // Save capture history to Supabase.
      const { error } = await supabaseClient
        .from('smart_inbox_captures')
        .insert({
          user_id: currentUser.id,
          content: text,
          destination: selected
        });

      if (error) throw error;

      alert(`Sent to ${labels[selected]} successfully.`);

      resetForm();

      await renderRecentCaptures();

    } catch (error) {
      console.error('Smart Inbox error:', error);

      if (routed) {
        alert(
          'Item was sent, but Recent Captures could not be saved. ' +
          'Do not send it again. Check Console.'
        );

        resetForm();
      } else {
        alert(
          error.message ||
          'Unable to send item. Check Console.'
        );
      }

    } finally {
      sending = false;
      sendButton.disabled = false;

      if (selected) {
        sendButton.textContent =
          `Send to ${labels[selected]} →`;
      }
    }
  });

  /* INITIALIZE SMART INBOX */

  async function init() {
    try {
      if (typeof supabaseClient === 'undefined') {
        throw new Error('Supabase configuration missing.');
      }

      currentUser = await getUser();

      if (!currentUser) {
        window.location.replace('login.html');
        return;
      }

      await renderRecentCaptures();

    } catch (error) {
      console.error(
        'Smart Inbox initialization error:',
        error
      );

      emptyCaptures(
        'Unable to load captures. Check Supabase and Console.'
      );
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
