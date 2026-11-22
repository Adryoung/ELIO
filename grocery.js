
/* ==========================================
   MELLYNNA-OS - GROCERY SUPABASE
   Add / Edit / Delete / Bought / Summary
========================================== */

let groceryItems = [];
let editingGroceryId = null;
let groceryUser = null;
let groceryBusy = false;

const groceryEl = id => document.getElementById(id);

const showGroceryForm = groceryEl('show-grocery-form');
const groceryForm = groceryEl('grocery-form');
const groceryFormTitle = groceryEl('grocery-form-title');
const groceryItemName = groceryEl('grocery-item-name');
const groceryItemQuantity = groceryEl('grocery-item-quantity');
const groceryItemCategory = groceryEl('grocery-item-category');
const groceryItemPrice = groceryEl('grocery-item-price');
const groceryItemNotes = groceryEl('grocery-item-notes');
const cancelGroceryItem = groceryEl('cancel-grocery-item');
const saveGroceryItemButton = groceryEl('save-grocery-item');
const groceryList = groceryEl('grocery-list');
const groceryItemCount = groceryEl('grocery-item-count');
const groceryOpenCount = groceryEl('grocery-open-count');
const groceryBoughtCount = groceryEl('grocery-bought-count');
const groceryTotal = groceryEl('grocery-total');

// ==========================================
// HELPERS
// ==========================================

function groceryMoney(value) {
    return 'RM ' + Number(value || 0).toFixed(2);
}

function groceryElement(tag, className = '', text) {
    const element = document.createElement(tag);

    if (className) element.className = className;

    if (text !== undefined) {
        element.textContent = String(text);
    }

    return element;
}

function groceryError(message, error) {
    console.error(message, error);
    alert(message + '\n' + (error?.message || String(error)));
}

function setGroceryBusy(value) {
    groceryBusy = value;

    showGroceryForm.disabled = value || !groceryUser;
    saveGroceryItemButton.disabled = value || !groceryUser;

    saveGroceryItemButton.textContent = value
        ? 'Saving...'
        : editingGroceryId === null
            ? 'Add Item'
            : 'Save Changes';

    groceryList.querySelectorAll('button, input[type="checkbox"]')
        .forEach(element => {
            element.disabled = value;
        });
}

function resetGroceryForm() {
    editingGroceryId = null;

    groceryItemName.value = '';
    groceryItemQuantity.value = '';
    groceryItemCategory.value = 'Vegetables';
    groceryItemPrice.value = '';
    groceryItemNotes.value = '';

    groceryFormTitle.textContent = 'Add Grocery Item';
    saveGroceryItemButton.textContent = 'Add Item';
}

function getGroceryCategoryClass(category) {
    const categories = [
        'Vegetables',
        'Meat',
        'Dairy',
        'Pantry',
        'Household'
    ];

    return categories.includes(category)
        ? 'category-' + category.toLowerCase()
        : 'category-other';
}

// ==========================================
// SUMMARY
// ==========================================

function updateGrocerySummary() {
    const openItems = groceryItems.filter(item => !item.bought);
    const boughtItems = groceryItems.filter(item => item.bought);

    const total = groceryItems.reduce(
        (sum, item) => sum + Number(item.price || 0),
        0
    );

    groceryOpenCount.textContent = openItems.length;
    groceryBoughtCount.textContent = boughtItems.length;
    groceryTotal.textContent = groceryMoney(total);

    groceryItemCount.textContent =
        openItems.length +
        (openItems.length === 1 ? ' Item' : ' Items');
}

// ==========================================
// SORT
// ==========================================

function sortGroceryItems() {
    groceryItems.sort((a, b) => {
        if (a.bought !== b.bought) {
            return a.bought ? 1 : -1;
        }

        const categoryCompare = (a.category || '')
            .localeCompare(b.category || '');

        if (categoryCompare !== 0) {
            return categoryCompare;
        }

        return (a.name || '').localeCompare(b.name || '');
    });
}

// ==========================================
// LOAD DATA FROM SUPABASE
// ==========================================

async function loadGroceryItems() {
    const allItems = [];
    const pageSize = 500;

    for (let offset = 0; ; offset += pageSize) {
        const { data, error } = await supabaseClient
            .from('grocery_items')
            .select(
                'id,user_id,name,quantity,category,price,notes,bought,created_at'
            )
            .eq('user_id', groceryUser.id)
            .order('id', { ascending: true })
            .range(offset, offset + pageSize - 1);

        if (error) throw error;

        allItems.push(...(data || []));

        if (!data || data.length < pageSize) break;
    }

    groceryItems = allItems;

    console.log('GROCERY LOADED:', groceryItems.length);

    renderGroceryItems();
}

// ==========================================
// RENDER GROCERY
// ==========================================

function renderGroceryItems() {
    groceryList.replaceChildren();

    sortGroceryItems();
    updateGrocerySummary();

    if (groceryItems.length === 0) {
        const empty = groceryElement('div', 'empty-state');

        empty.append(
            groceryElement(
                'h3',
                '',
                'Your grocery list is empty'
            ),
            groceryElement(
                'p',
                '',
                'Click + Add Item to start your shopping list.'
            )
        );

        groceryList.append(empty);
        return;
    }

    groceryItems.forEach(item => {
        const row = groceryElement('div', 'grocery-item');

        if (item.bought) {
            row.classList.add('bought');
        }

        // BOUGHT CHECKBOX
        const checkbox = groceryElement('input');
        checkbox.type = 'checkbox';
        checkbox.checked = Boolean(item.bought);

        checkbox.addEventListener('change', async () => {
            if (groceryBusy) return;

            const newValue = checkbox.checked;
            setGroceryBusy(true);

            try {
                const { data, error } = await supabaseClient
                    .from('grocery_items')
                    .update({ bought: newValue })
                    .eq('id', item.id)
                    .eq('user_id', groceryUser.id)
                    .select('id');

                if (error) throw error;

                if (!data?.length) {
                    throw new Error('Item was not updated.');
                }

                await loadGroceryItems();

            } catch (error) {
                checkbox.checked = !newValue;
                groceryError('Unable to update Bought status', error);
            } finally {
                setGroceryBusy(false);
            }
        });

        // DETAILS
        const details = groceryElement('div', 'grocery-details');

        details.append(
            groceryElement('h3', '', item.name)
        );

        const meta = groceryElement('div', 'grocery-meta');

        meta.append(
            groceryElement(
                'span',
                'badge ' + getGroceryCategoryClass(item.category),
                item.category
            )
        );

        if (item.quantity) {
            meta.append(
                groceryElement('span', '', item.quantity)
            );
        }

        meta.append(
            groceryElement(
                'span',
                'item-price',
                groceryMoney(item.price)
            )
        );

        details.append(meta);

        if (item.notes) {
            details.append(
                groceryElement('p', 'grocery-notes', item.notes)
            );
        }

        // ACTION BUTTONS
        const actions = groceryElement('div', 'grocery-actions');

        const editButton = groceryElement(
            'button',
            'edit-button',
            'Edit'
        );
        editButton.type = 'button';

        editButton.addEventListener('click', () => {
            if (groceryBusy) return;

            editingGroceryId = item.id;

            groceryItemName.value = item.name || '';
            groceryItemQuantity.value = item.quantity || '';
            groceryItemCategory.value = item.category || 'Other';
            groceryItemPrice.value = item.price ?? '';
            groceryItemNotes.value = item.notes || '';

            groceryFormTitle.textContent = 'Edit Grocery Item';
            saveGroceryItemButton.textContent = 'Save Changes';

            groceryForm.classList.remove('hidden');

            groceryForm.scrollIntoView({
                behavior: 'smooth',
                block: 'start'
            });

            groceryItemName.focus();
        });

        const deleteButton = groceryElement(
            'button',
            'delete-button',
            'Delete'
        );
        deleteButton.type = 'button';

        deleteButton.addEventListener('click', async () => {
            if (groceryBusy) return;

            if (!confirm('Delete "' + item.name + '"?')) {
                return;
            }

            setGroceryBusy(true);

            try {
                const { data, error } = await supabaseClient
                    .from('grocery_items')
                    .delete()
                    .eq('id', item.id)
                    .eq('user_id', groceryUser.id)
                    .select('id');

                if (error) throw error;

                if (!data?.length) {
                    throw new Error('Item was not deleted.');
                }

                await loadGroceryItems();

            } catch (error) {
                groceryError('Unable to delete item', error);
            } finally {
                setGroceryBusy(false);
            }
        });

        actions.append(editButton, deleteButton);
        row.append(checkbox, details, actions);
        groceryList.append(row);
    });
}

// ==========================================
// SHOW / CANCEL FORM
// ==========================================

showGroceryForm.addEventListener('click', () => {
    if (groceryBusy || !groceryUser) return;

    resetGroceryForm();
    groceryForm.classList.remove('hidden');
    groceryItemName.focus();
});

cancelGroceryItem.addEventListener('click', () => {
    if (groceryBusy) return;

    resetGroceryForm();
    groceryForm.classList.add('hidden');
});

// ==========================================
// ADD / EDIT ITEM
// ==========================================

saveGroceryItemButton.addEventListener('click', async () => {
    if (groceryBusy || !groceryUser) return;

    const name = groceryItemName.value.trim();
    const quantity = groceryItemQuantity.value.trim();
    const category = groceryItemCategory.value;
    const priceText = groceryItemPrice.value.trim();
    const price = priceText === '' ? 0 : Number(priceText);
    const notes = groceryItemNotes.value.trim();

    if (!name) {
        alert('Please enter an item name.');
        groceryItemName.focus();
        return;
    }

    if (!Number.isFinite(price) || price < 0) {
        alert('Please enter a valid price (RM).');
        groceryItemPrice.focus();
        return;
    }

    const payload = {
        name,
        quantity,
        category,
        price,
        notes
    };

    setGroceryBusy(true);

    try {
        let result;

        if (editingGroceryId === null) {
            result = await supabaseClient
                .from('grocery_items')
                .insert({
                    ...payload,
                    user_id: groceryUser.id,
                    bought: false
                })
                .select('id');
        } else {
            result = await supabaseClient
                .from('grocery_items')
                .update(payload)
                .eq('id', editingGroceryId)
                .eq('user_id', groceryUser.id)
                .select('id');
        }

        if (result.error) throw result.error;

        if (!result.data?.length) {
            throw new Error('No item was saved.');
        }

        await loadGroceryItems();

        resetGroceryForm();
        groceryForm.classList.add('hidden');

    } catch (error) {
        groceryError('Unable to save grocery item', error);
    } finally {
        setGroceryBusy(false);
    }
});

// ==========================================
// INITIALIZE
// ==========================================

async function initializeGrocery() {
    resetGroceryForm();

    showGroceryForm.disabled = true;
    saveGroceryItemButton.disabled = true;

    groceryList.replaceChildren(
        groceryElement('div', 'empty-state', 'Loading grocery items...')
    );

    try {
        if (typeof supabaseClient === 'undefined') {
            throw new Error('Supabase configuration is not loaded.');
        }

        const { data, error } = await supabaseClient.auth.getUser();

        if (error) throw error;

        if (!data?.user) {
            window.location.replace('login.html');
            return;
        }

        groceryUser = data.user;

        await loadGroceryItems();

        setGroceryBusy(false);

        console.log('Mellynna-OS Grocery connected to Supabase.');

    } catch (error) {
        groceryError('Unable to load grocery items', error);

        groceryList.replaceChildren(
            groceryElement(
                'div',
                'empty-state',
                'Unable to load grocery items. Please check Supabase.'
            )
        );
    }
}

initializeGrocery();
