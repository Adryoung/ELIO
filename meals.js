
/* ==========================================
   MELLYNNA-OS - MEALS & RECIPES
   SUPABASE INTEGRATION
========================================== */

// ==========================================
// GLOBAL DATA
// ==========================================

let meals = [];
let recipes = [];

let currentUser = null;

let editingMealId = null;
let editingRecipeId = null;

let mealBusy = false;
let recipeBusy = false;

// ==========================================
// ELEMENTS
// ==========================================

const el = id => document.getElementById(id);

// Meal elements
const showMealForm = el('show-meal-form');
const mealForm = el('meal-form');
const mealFormTitle = el('meal-form-title');
const mealDay = el('meal-day');
const mealName = el('meal-name');
const mealNotes = el('meal-notes');
const cancelMeal = el('cancel-meal');
const saveMealButton = el('save-meal');
const mealList = el('meal-list');
const mealCount = el('meal-count');

// Recipe elements
const showRecipeForm = el('show-recipe-form');
const recipeForm = el('recipe-form');
const recipeFormTitle = el('recipe-form-title');
const recipeName = el('recipe-name');
const recipeIngredients = el('recipe-ingredients');
const recipeSteps = el('recipe-steps');
const cancelRecipe = el('cancel-recipe');
const saveRecipeButton = el('save-recipe');
const recipeList = el('recipe-list');
const recipeCount = el('recipe-count');

// ==========================================
// HELPERS
// ==========================================

function makeElement(tag, className = '', text) {
    const element = document.createElement(tag);

    if (className) {
        element.className = className;
    }

    if (text !== undefined) {
        element.textContent = String(text);
    }

    return element;
}

function showDatabaseError(message, error) {
    console.error(message, error);

    alert(
        message + '\n' +
        (error?.message || String(error))
    );
}

function updateCounters() {
    mealCount.textContent = meals.length;
    recipeCount.textContent = recipes.length;
}

// ==========================================
// BUSY STATES
// ==========================================

function setMealBusy(value) {
    mealBusy = value;

    showMealForm.disabled = value || !currentUser;
    saveMealButton.disabled = value || !currentUser;
    cancelMeal.disabled = value;

    saveMealButton.textContent = value
        ? 'Saving...'
        : editingMealId === null
            ? 'Save Meal'
            : 'Save Changes';

    mealList.querySelectorAll('button').forEach(button => {
        button.disabled = value;
    });
}

function setRecipeBusy(value) {
    recipeBusy = value;

    showRecipeForm.disabled = value || !currentUser;
    saveRecipeButton.disabled = value || !currentUser;
    cancelRecipe.disabled = value;

    saveRecipeButton.textContent = value
        ? 'Saving...'
        : editingRecipeId === null
            ? 'Save Recipe'
            : 'Save Changes';

    recipeList.querySelectorAll('button').forEach(button => {
        button.disabled = value;
    });
}

// ==========================================
// RESET FORMS
// ==========================================

function resetMealForm() {
    editingMealId = null;

    mealDay.value = '';
    mealName.value = '';
    mealNotes.value = '';

    mealFormTitle.textContent = 'Add Meal';
    saveMealButton.textContent = 'Save Meal';
}

function resetRecipeForm() {
    editingRecipeId = null;

    recipeName.value = '';
    recipeIngredients.value = '';
    recipeSteps.value = '';

    recipeFormTitle.textContent = 'Add Recipe';
    saveRecipeButton.textContent = 'Save Recipe';
}

// ==========================================
// LOAD MEALS FROM SUPABASE
// ==========================================

async function loadMeals() {
    const allMeals = [];
    const pageSize = 500;

    for (let offset = 0; ; offset += pageSize) {
        const { data, error } = await supabaseClient
            .from('meal_plans')
            .select(
                'id,user_id,day,name,notes,created_at'
            )
            .eq('user_id', currentUser.id)
            .order('id', { ascending: false })
            .range(offset, offset + pageSize - 1);

        if (error) throw error;

        allMeals.push(...(data || []));

        if (!data || data.length < pageSize) {
            break;
        }
    }

    meals = allMeals;
    renderMeals();
    updateCounters();

    console.log('MEALS LOADED:', meals.length);
}

// ==========================================
// LOAD RECIPES FROM SUPABASE
// ==========================================

async function loadRecipes() {
    const allRecipes = [];
    const pageSize = 500;

    for (let offset = 0; ; offset += pageSize) {
        const { data, error } = await supabaseClient
            .from('recipes')
            .select(
                'id,user_id,name,ingredients,steps,created_at'
            )
            .eq('user_id', currentUser.id)
            .order('id', { ascending: false })
            .range(offset, offset + pageSize - 1);

        if (error) throw error;

        allRecipes.push(...(data || []));

        if (!data || data.length < pageSize) {
            break;
        }
    }

    recipes = allRecipes;
    renderRecipes();
    updateCounters();

    console.log('RECIPES LOADED:', recipes.length);
}

// ==========================================
// RENDER MEALS
// ==========================================

function renderMeals() {
    mealList.replaceChildren();

    if (meals.length === 0) {
        const empty = makeElement(
            'div',
            'empty-state'
        );

        empty.append(
            makeElement(
                'h3',
                '',
                'No meals planned yet'
            ),
            makeElement(
                'p',
                '',
                'Click + Add Meal to start planning.'
            )
        );

        mealList.appendChild(empty);
        return;
    }

    meals.forEach(meal => {
        const item = makeElement(
            'div',
            'meal-item'
        );

        const details = makeElement(
            'div',
            'meal-details'
        );

        details.append(
            makeElement(
                'div',
                'meal-day',
                meal.day
            ),
            makeElement(
                'h3',
                '',
                meal.name
            )
        );

        if (meal.notes) {
            details.appendChild(
                makeElement(
                    'p',
                    'meal-notes',
                    meal.notes
                )
            );
        }

        const actions = makeElement(
            'div',
            'item-actions'
        );

        // EDIT MEAL
        const editButton = makeElement(
            'button',
            'edit-button',
            'Edit'
        );

        editButton.type = 'button';

        editButton.addEventListener('click', () => {
            if (mealBusy) return;

            editingMealId = meal.id;

            mealDay.value = meal.day;
            mealName.value = meal.name;
            mealNotes.value = meal.notes || '';

            mealFormTitle.textContent = 'Edit Meal';
            saveMealButton.textContent = 'Save Changes';

            mealForm.classList.remove('hidden');

            mealForm.scrollIntoView({
                behavior: 'smooth',
                block: 'start'
            });

            mealDay.focus();
        });

        // DELETE MEAL
        const deleteButton = makeElement(
            'button',
            'delete-button',
            'Delete'
        );

        deleteButton.type = 'button';

        deleteButton.addEventListener(
            'click',
            async () => {
                if (mealBusy) return;

                if (!confirm(
                    'Delete "' + meal.name + '"?'
                )) {
                    return;
                }

                setMealBusy(true);

                try {
                    const { data, error } =
                        await supabaseClient
                            .from('meal_plans')
                            .delete()
                            .eq('id', meal.id)
                            .eq('user_id', currentUser.id)
                            .select('id');

                    if (error) throw error;

                    if (!data?.length) {
                        throw new Error(
                            'Meal was not deleted.'
                        );
                    }

                    await loadMeals();

                    if (editingMealId === meal.id) {
                        resetMealForm();
                        mealForm.classList.add('hidden');
                    }

                } catch (error) {
                    showDatabaseError(
                        'Unable to delete meal',
                        error
                    );

                } finally {
                    setMealBusy(false);
                }
            }
        );

        actions.append(editButton, deleteButton);
        item.append(details, actions);

        mealList.appendChild(item);
    });
}

// ==========================================
// RENDER RECIPES
// ==========================================

function renderRecipes() {
    recipeList.replaceChildren();

    if (recipes.length === 0) {
        const empty = makeElement(
            'div',
            'empty-state'
        );

        empty.append(
            makeElement(
                'h3',
                '',
                'No recipes saved yet'
            ),
            makeElement(
                'p',
                '',
                'Save your first recipe for later.'
            )
        );

        recipeList.appendChild(empty);
        return;
    }

    recipes.forEach(recipe => {
        const card = makeElement(
            'div',
            'recipe-card'
        );

        const content = makeElement(
            'div',
            'recipe-content'
        );

        content.appendChild(
            makeElement(
                'h3',
                '',
                recipe.name
            )
        );

        // INGREDIENTS
        const ingredientsSection = makeElement(
            'div',
            'recipe-section'
        );

        ingredientsSection.append(
            makeElement(
                'strong',
                '',
                'Ingredients'
            ),
            makeElement(
                'p',
                '',
                recipe.ingredients || ''
            )
        );

        // STEPS
        const stepsSection = makeElement(
            'div',
            'recipe-section'
        );

        stepsSection.append(
            makeElement(
                'strong',
                '',
                'Steps'
            ),
            makeElement(
                'p',
                '',
                recipe.steps || ''
            )
        );

        content.append(
            ingredientsSection,
            stepsSection
        );

        const actions = makeElement(
            'div',
            'item-actions'
        );

        // EDIT RECIPE
        const editButton = makeElement(
            'button',
            'edit-button',
            'Edit'
        );

        editButton.type = 'button';

        editButton.addEventListener('click', () => {
            if (recipeBusy) return;

            editingRecipeId = recipe.id;

            recipeName.value = recipe.name;
            recipeIngredients.value =
                recipe.ingredients || '';
            recipeSteps.value =
                recipe.steps || '';

            recipeFormTitle.textContent = 'Edit Recipe';
            saveRecipeButton.textContent = 'Save Changes';

            recipeForm.classList.remove('hidden');

            recipeForm.scrollIntoView({
                behavior: 'smooth',
                block: 'start'
            });

            recipeName.focus();
        });

        // DELETE RECIPE
        const deleteButton = makeElement(
            'button',
            'delete-button',
            'Delete'
        );

        deleteButton.type = 'button';

        deleteButton.addEventListener(
            'click',
            async () => {
                if (recipeBusy) return;

                if (!confirm(
                    'Delete recipe "' +
                    recipe.name +
                    '"?'
                )) {
                    return;
                }

                setRecipeBusy(true);

                try {
                    const { data, error } =
                        await supabaseClient
                            .from('recipes')
                            .delete()
                            .eq('id', recipe.id)
                            .eq('user_id', currentUser.id)
                            .select('id');

                    if (error) throw error;

                    if (!data?.length) {
                        throw new Error(
                            'Recipe was not deleted.'
                        );
                    }

                    await loadRecipes();

                    if (editingRecipeId === recipe.id) {
                        resetRecipeForm();
                        recipeForm.classList.add('hidden');
                    }

                } catch (error) {
                    showDatabaseError(
                        'Unable to delete recipe',
                        error
                    );

                } finally {
                    setRecipeBusy(false);
                }
            }
        );

        actions.append(editButton, deleteButton);
        card.append(content, actions);

        recipeList.appendChild(card);
    });
}

// ==========================================
// SHOW / CANCEL MEAL FORM
// ==========================================

showMealForm.addEventListener('click', () => {
    if (mealBusy || !currentUser) return;

    resetMealForm();
    mealForm.classList.remove('hidden');
    mealDay.focus();
});

cancelMeal.addEventListener('click', () => {
    if (mealBusy) return;

    resetMealForm();
    mealForm.classList.add('hidden');
});

// ==========================================
// SAVE MEAL TO SUPABASE
// ==========================================

saveMealButton.addEventListener(
    'click',
    async () => {
        if (mealBusy || !currentUser) return;

        const day = mealDay.value.trim();
        const name = mealName.value.trim();
        const notes = mealNotes.value.trim();

        if (!day || !name) {
            alert(
                'Please enter the day and meal name.'
            );
            return;
        }

        const payload = {
            day,
            name,
            notes
        };

        setMealBusy(true);

        try {
            let result;

            if (editingMealId === null) {
                // ADD MEAL
                result = await supabaseClient
                    .from('meal_plans')
                    .insert({
                        ...payload,
                        user_id: currentUser.id
                    })
                    .select('id');

            } else {
                // EDIT MEAL
                result = await supabaseClient
                    .from('meal_plans')
                    .update(payload)
                    .eq('id', editingMealId)
                    .eq('user_id', currentUser.id)
                    .select('id');
            }

            if (result.error) throw result.error;

            if (!result.data?.length) {
                throw new Error(
                    'Meal was not saved.'
                );
            }

            await loadMeals();

            resetMealForm();
            mealForm.classList.add('hidden');

        } catch (error) {
            showDatabaseError(
                'Unable to save meal',
                error
            );

        } finally {
            setMealBusy(false);
        }
    }
);

// ==========================================
// SHOW / CANCEL RECIPE FORM
// ==========================================

showRecipeForm.addEventListener('click', () => {
    if (recipeBusy || !currentUser) return;

    resetRecipeForm();
    recipeForm.classList.remove('hidden');
    recipeName.focus();
});

cancelRecipe.addEventListener('click', () => {
    if (recipeBusy) return;

    resetRecipeForm();
    recipeForm.classList.add('hidden');
});

// ==========================================
// SAVE RECIPE TO SUPABASE
// ==========================================

saveRecipeButton.addEventListener(
    'click',
    async () => {
        if (recipeBusy || !currentUser) return;

        const name = recipeName.value.trim();

        const ingredients =
            recipeIngredients.value.trim();

        const steps =
            recipeSteps.value.trim();

        if (!name) {
            alert(
                'Please enter a recipe name.'
            );

            recipeName.focus();
            return;
        }

        const payload = {
            name,
            ingredients,
            steps
        };

        setRecipeBusy(true);

        try {
            let result;

            if (editingRecipeId === null) {
                // ADD RECIPE
                result = await supabaseClient
                    .from('recipes')
                    .insert({
                        ...payload,
                        user_id: currentUser.id
                    })
                    .select('id');

            } else {
                // EDIT RECIPE
                result = await supabaseClient
                    .from('recipes')
                    .update(payload)
                    .eq('id', editingRecipeId)
                    .eq('user_id', currentUser.id)
                    .select('id');
            }

            if (result.error) throw result.error;

            if (!result.data?.length) {
                throw new Error(
                    'Recipe was not saved.'
                );
            }

            await loadRecipes();

            resetRecipeForm();
            recipeForm.classList.add('hidden');

        } catch (error) {
            showDatabaseError(
                'Unable to save recipe',
                error
            );

        } finally {
            setRecipeBusy(false);
        }
    }
);

// ==========================================
// INITIALIZE APPLICATION
// ==========================================

async function initializeMealsAndRecipes() {
    resetMealForm();
    resetRecipeForm();

    showMealForm.disabled = true;
    saveMealButton.disabled = true;

    showRecipeForm.disabled = true;
    saveRecipeButton.disabled = true;

    mealList.replaceChildren(
        makeElement(
            'div',
            'empty-state',
            'Loading meals...'
        )
    );

    recipeList.replaceChildren(
        makeElement(
            'div',
            'empty-state',
            'Loading recipes...'
        )
    );

    try {
        if (typeof supabaseClient === 'undefined') {
            throw new Error(
                'Supabase configuration is not loaded.'
            );
        }

        const { data, error } =
            await supabaseClient.auth.getUser();

        if (error) throw error;

        if (!data?.user) {
            window.location.replace('login.html');
            return;
        }

        currentUser = data.user;

        // Load both modules
        await Promise.all([
            loadMeals(),
            loadRecipes()
        ]);

        setMealBusy(false);
        setRecipeBusy(false);

        console.log(
            'Mellynna-OS Meals & Recipes connected to Supabase.'
        );

    } catch (error) {
        showDatabaseError(
            'Unable to load Meals & Recipes',
            error
        );

        mealList.replaceChildren(
            makeElement(
                'div',
                'empty-state',
                'Unable to load meals. Check Supabase.'
            )
        );

        recipeList.replaceChildren(
            makeElement(
                'div',
                'empty-state',
                'Unable to load recipes. Check Supabase.'
            )
        );
    }
}

// ==========================================
// START
// ==========================================

initializeMealsAndRecipes();
