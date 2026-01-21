// ===================================
// STATE MANAGEMENT
// ===================================
const state = {
    expenses: [],
    categories: [],
    currentView: 'home',
    currentMonth: new Date().getMonth() + 1,
    currentYear: new Date().getFullYear(),
    currentExpenseId: null // Track if we are editing
};

// ===================================
// API FUNCTIONS
// ===================================
const API = {
    async getCategories() {
        const response = await fetch('/api/categories');
        if (!response.ok) throw new Error('Failed to fetch categories');
        return response.json();
    },

    async getExpenses(month, year) {
        const params = new URLSearchParams();
        if (month) params.append('month', month);
        if (year) params.append('year', year);

        const response = await fetch(`/api/expenses?${params}`);
        if (!response.ok) throw new Error('Failed to fetch expenses');
        return response.json();
    },

    async createExpense(expenseData) {
        const response = await fetch('/api/expenses', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(expenseData)
        });
        if (!response.ok) throw new Error('Failed to create expense');
        return response.json();
    },

    async updateExpense(id, expenseData) {
        const response = await fetch(`/api/expenses/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(expenseData)
        });
        if (!response.ok) throw new Error('Failed to update expense');
        return response.json();
    },

    async deleteExpense(id) {
        const response = await fetch(`/api/expenses/${id}`, {
            method: 'DELETE'
        });
        if (!response.ok) throw new Error('Failed to delete expense');
        return response.json();
    },

    async createCategory(categoryData) {
        const response = await fetch('/api/categories', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(categoryData)
        });
        if (!response.ok) throw new Error('Failed to create category');
        return response.json();
    },

    async getMonthlySummary(year, month) {
        const response = await fetch(`/api/summary/${year}/${month}`);
        if (!response.ok) throw new Error('Failed to fetch summary');
        return response.json();
    }
};

// ===================================
// UI FUNCTIONS
// ===================================
const UI = {
    showToast(message, type = 'success') {
        const toast = document.getElementById('toast');
        toast.textContent = message;
        toast.className = `toast ${type} active`;

        setTimeout(() => {
            toast.classList.remove('active');
        }, 3000);
    },

    formatCurrency(amount) {
        return `₹${parseFloat(amount).toLocaleString('en-IN', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        })}`;
    },

    formatDate(dateString) {
        const date = new Date(dateString + 'T00:00:00');
        const today = new Date();
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);

        if (date.toDateString() === today.toDateString()) {
            return 'Today';
        } else if (date.toDateString() === yesterday.toDateString()) {
            return 'Yesterday';
        } else {
            return date.toLocaleDateString('en-IN', {
                day: 'numeric',
                month: 'short',
                year: date.getFullYear() !== today.getFullYear() ? 'numeric' : undefined
            });
        }
    },

    updateCurrentDate() {
        const dateEl = document.getElementById('currentDate');
        const now = new Date();
        const formatted = now.toLocaleDateString('en-IN', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
        dateEl.textContent = formatted;
    },

    switchView(viewName) {
        state.currentView = viewName;

        document.querySelectorAll('.nav-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.view === viewName);
        });

        document.querySelectorAll('.view').forEach(view => {
            view.classList.toggle('active', view.id === `${viewName}-view`);
        });

        if (viewName === 'home') {
            loadHomeView();
        } else if (viewName === 'history') {
            loadHistoryView();
        } else if (viewName === 'analytics') {
            loadAnalyticsView();
        }
    },

    openModal(expense = null) {
        const modal = document.getElementById('expenseModal');
        const form = document.getElementById('expenseForm');
        const title = modal.querySelector('.modal-title');
        const btn = document.getElementById('saveExpenseBtn');

        modal.classList.add('active');

        if (expense) {
            // Edit Mode
            state.currentExpenseId = expense.id;
            title.textContent = 'Edit Expense';
            btn.textContent = 'Save Changes';

            document.getElementById('amount').value = expense.amount;
            document.getElementById('date').value = expense.date;
            document.getElementById('category').value = expense.categoryId;
            document.getElementById('note').value = expense.note || '';
        } else {
            // Add Mode
            state.currentExpenseId = null;
            title.textContent = 'Add Expense';
            btn.textContent = 'Add Expense';
            form.reset();
            document.getElementById('date').valueAsDate = new Date();
        }

        document.getElementById('amount').focus();
    },

    closeModal() {
        const modal = document.getElementById('expenseModal');
        modal.classList.remove('active');
        document.getElementById('expenseForm').reset();
    },

    openCategoryModal() {
        const modal = document.getElementById('categoryModal');
        modal.classList.add('active');
        document.getElementById('catName').focus();
    },

    closeCategoryModal() {
        const modal = document.getElementById('categoryModal');
        modal.classList.remove('active');
        document.getElementById('categoryForm').reset();
    },

    renderTransactionItem(expense, showDelete = true) {
        const item = document.createElement('div');
        item.className = 'transaction-item';

        item.innerHTML = `
      <div class="transaction-icon" style="border-color: ${expense.categoryColor}; background: ${expense.categoryColor}20;">
        ${expense.categoryIcon}
      </div>
      <div class="transaction-details">
        <div class="transaction-category">${expense.categoryName}</div>
        ${expense.note ? `<div class="transaction-note">${expense.note}</div>` : ''}
        <div class="transaction-date">${UI.formatDate(expense.date)}</div>
      </div>
      <div class="transaction-amount">${UI.formatCurrency(expense.amount)}</div>
      ${showDelete ? `<button class="transaction-delete" data-id="${expense.id}">Delete</button>` : ''}
    `;

        // Add edit handler (click on item)
        item.addEventListener('click', () => {
            UI.openModal(expense);
        });

        // Add delete handler
        if (showDelete) {
            const deleteBtn = item.querySelector('.transaction-delete');
            deleteBtn.addEventListener('click', async (e) => {
                e.stopPropagation(); // Prevent edit modal from opening
                if (confirm('Delete this expense?')) {
                    await handleDeleteExpense(expense.id);
                }
            });
        }

        return item;
    },

    renderEmptyState(message = 'No expenses yet', icon = '📭') {
        return `
      <div class="empty-state">
        <div class="empty-state-icon">${icon}</div>
        <div class="empty-state-text">${message}</div>
      </div>
    `;
    }
};

// ===================================
// VIEW LOADERS
// ===================================
async function loadHomeView() {
    try {
        const summary = await API.getMonthlySummary(state.currentYear, state.currentMonth);
        const expenses = await API.getExpenses(state.currentMonth, state.currentYear);

        document.getElementById('monthlyTotal').textContent = UI.formatCurrency(summary.total);
        document.getElementById('monthlySublabel').textContent =
            `${expenses.length} transaction${expenses.length !== 1 ? 's' : ''}`;

        const recentList = document.getElementById('recentList');
        recentList.innerHTML = '';

        if (expenses.length === 0) {
            recentList.innerHTML = UI.renderEmptyState('No expenses this month', '💸');
        } else {
            const recentExpenses = expenses.slice(0, 5);
            recentExpenses.forEach(expense => {
                recentList.appendChild(UI.renderTransactionItem(expense, false));
            });
        }
    } catch (error) {
        console.error('Error loading home view:', error);
        UI.showToast('Failed to load data', 'error');
    }
}

async function loadHistoryView() {
    try {
        const expenses = await API.getExpenses(state.currentMonth, state.currentYear);

        const historyList = document.getElementById('historyList');
        historyList.innerHTML = '';

        if (expenses.length === 0) {
            historyList.innerHTML = UI.renderEmptyState('No expenses found', '🔍');
        } else {
            expenses.forEach(expense => {
                historyList.appendChild(UI.renderTransactionItem(expense, true));
            });
        }
    } catch (error) {
        console.error('Error loading history view:', error);
        UI.showToast('Failed to load history', 'error');
    }
}

async function loadAnalyticsView() {
    try {
        const summary = await API.getMonthlySummary(state.currentYear, state.currentMonth);

        document.getElementById('analyticsTotal').textContent = UI.formatCurrency(summary.total);

        const chartContainer = document.getElementById('categoryChart');
        chartContainer.innerHTML = '';

        if (summary.breakdown.length === 0) {
            chartContainer.innerHTML = UI.renderEmptyState('No data to display', '📊');
        } else {
            summary.breakdown.forEach(category => {
                const percentage = summary.total > 0 ? (category.total / summary.total * 100) : 0;

                const barEl = document.createElement('div');
                barEl.className = 'category-bar';
                barEl.innerHTML = `
          <div class="category-bar-header">
            <div class="category-bar-icon" style="border-color: ${category.hexColor}; background: ${category.hexColor}20;">
              ${category.icon}
            </div>
            <div class="category-bar-info">
              <div class="category-bar-name">${category.name}</div>
            </div>
            <div class="category-bar-amount">${UI.formatCurrency(category.total)}</div>
          </div>
          <div class="category-bar-visual">
            <div class="category-bar-fill" style="width: ${percentage}%; background: ${category.hexColor};"></div>
          </div>
          <div class="category-bar-percentage">${percentage.toFixed(1)}% • ${category.count} transaction${category.count !== 1 ? 's' : ''}</div>
        `;

                chartContainer.appendChild(barEl);
            });
        }
    } catch (error) {
        console.error('Error loading analytics view:', error);
        UI.showToast('Failed to load analytics', 'error');
    }
}

// ===================================
// EVENT HANDLERS
// ===================================
async function handleSaveExpense(event) {
    event.preventDefault();

    const formData = new FormData(event.target);
    const expenseData = {
        amount: parseFloat(formData.get('amount')),
        date: formData.get('date'),
        categoryId: parseInt(formData.get('categoryId')),
        note: formData.get('note') || ''
    };

    try {
        if (state.currentExpenseId) {
            await API.updateExpense(state.currentExpenseId, expenseData);
            UI.showToast('Expense updated successfully!', 'success');
        } else {
            await API.createExpense(expenseData);
            UI.showToast('Expense added successfully!', 'success');
        }

        UI.closeModal();
        UI.switchView(state.currentView);
    } catch (error) {
        console.error('Error saving expense:', error);
        UI.showToast('Failed to save expense', 'error');
    }
}

async function handleSaveCategory(event) {
    event.preventDefault();

    const formData = new FormData(event.target);
    const categoryData = {
        name: formData.get('name'),
        icon: formData.get('icon'),
        hexColor: formData.get('hexColor')
    };

    try {
        await API.createCategory(categoryData);
        UI.showToast('Category created!', 'success');

        // Refresh dropdown
        await populateCategorySelect();
        UI.closeCategoryModal();

        // Select the new category
        // (Optimization: we could select the last added, but simplistic for now)
    } catch (error) {
        console.error('Error creating category:', error);
        UI.showToast('Failed to create category', 'error');
    }
}

async function handleDeleteExpense(id) {
    try {
        await API.deleteExpense(id);
        UI.showToast('Expense deleted', 'success');
        UI.switchView(state.currentView);
    } catch (error) {
        console.error('Error deleting expense:', error);
        UI.showToast('Failed to delete expense', 'error');
    }
}

// ===================================
// INITIALIZATION
// ===================================
async function populateCategorySelect() {
    try {
        const categories = await API.getCategories();
        state.categories = categories;

        const select = document.getElementById('category');
        // Save current selection if re-populating
        const currentVal = select.value;

        select.innerHTML = categories.map(cat =>
            `<option value="${cat.id}">${cat.icon} ${cat.name}</option>`
        ).join('');

        if (currentVal && categories.find(c => c.id == currentVal)) {
            select.value = currentVal;
        }
    } catch (error) {
        console.error('Error loading categories:', error);
    }
}

function populateMonthFilter() {
    const select = document.getElementById('monthFilter');
    const now = new Date();

    const months = [];
    for (let i = 0; i < 12; i++) {
        const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
        months.push({
            value: `${date.getFullYear()}-${date.getMonth() + 1}`,
            label: date.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' }),
            month: date.getMonth() + 1,
            year: date.getFullYear()
        });
    }

    select.innerHTML = months.map((m, i) =>
        `<option value="${m.value}" ${i === 0 ? 'selected' : ''}>${m.label}</option>`
    ).join('');

    select.addEventListener('change', (e) => {
        const [year, month] = e.target.value.split('-');
        state.currentYear = parseInt(year);
        state.currentMonth = parseInt(month);
        loadHistoryView();
    });
}

function initEventListeners() {
    // Navigation
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            UI.switchView(btn.dataset.view);
        });
    });

    // FAB & Buttons
    document.getElementById('addExpenseBtn').addEventListener('click', () => UI.openModal());
    document.getElementById('addCategoryBtn').addEventListener('click', UI.openCategoryModal);

    // Modals
    document.getElementById('closeModal').addEventListener('click', UI.closeModal);
    document.querySelector('#expenseModal .modal-backdrop').addEventListener('click', UI.closeModal);

    document.getElementById('closeCategoryModal').addEventListener('click', UI.closeCategoryModal);
    document.querySelector('#categoryModal .modal-backdrop').addEventListener('click', UI.closeCategoryModal);

    // Forms
    document.getElementById('expenseForm').addEventListener('submit', handleSaveExpense);
    document.getElementById('categoryForm').addEventListener('submit', handleSaveCategory);

    document.getElementById('date').valueAsDate = new Date();
}

async function init() {
    UI.updateCurrentDate();
    initEventListeners();
    await populateCategorySelect();
    populateMonthFilter();
    loadHomeView();

    if ('serviceWorker' in navigator) {
        try {
            await navigator.serviceWorker.register('/sw.js');
            console.log('✅ Service Worker registered');
        } catch (error) {
            console.error('❌ Service Worker registration failed:', error);
        }
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
