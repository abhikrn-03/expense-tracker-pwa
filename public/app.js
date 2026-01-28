// ===================================
// STATE MANAGEMENT
// ===================================
const state = {
    expenses: [],
    incomes: [],
    categories: [],
    incomeCategories: [],
    accounts: [],
    defaultAccount: null,
    currentView: localStorage.getItem('currentView') || 'home',
    viewType: 'expense', // 'expense' or 'income'
    analyticsChartType: 'expense', // 'expense', 'income', or 'net'
    currentMonth: new Date().getMonth() + 1,
    currentYear: new Date().getFullYear(),
    currentExpenseId: null, // Track if we are editing
    currentIncomeId: null,
    authToken: localStorage.getItem('authToken') || null,
    currentUser: JSON.parse(localStorage.getItem('currentUser') || 'null')
};

// ===================================
// AUTH FUNCTIONS
// ===================================
const Auth = {
    getToken() {
        return state.authToken;
    },

    setToken(token) {
        state.authToken = token;
        localStorage.setItem('authToken', token);
    },

    setUser(user) {
        state.currentUser = user;
        localStorage.setItem('currentUser', JSON.stringify(user));
    },

    clearAuth() {
        state.authToken = null;
        state.currentUser = null;
        localStorage.removeItem('authToken');
        localStorage.removeItem('currentUser');
    },

    isAuthenticated() {
        return !!state.authToken;
    },

    async login(username, password) {
        const response = await fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Login failed');
        }

        const data = await response.json();
        this.setToken(data.token);
        this.setUser(data.user);
        return data;
    },

    async register(username, password) {
        const response = await fetch('/api/auth/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Registration failed');
        }

        const data = await response.json();
        this.setToken(data.token);
        this.setUser(data.user);
        return data;
    },

    logout() {
        this.clearAuth();
        location.reload();
    },

    async verifyToken() {
        if (!state.authToken) {
            return null;
        }

        try {
            const response = await fetch('/api/auth/verify', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${state.authToken}`
                }
            });

            if (!response.ok) {
                // Token is invalid or expired
                this.clearAuth();
                return null;
            }

            const data = await response.json();
            this.setUser(data.user);
            return data.user;
        } catch (error) {
            console.error('Token verification failed:', error);
            this.clearAuth();
            return null;
        }
    }
};

// Validate user data structure
function validateUserData(user) {
    return user &&
        typeof user === 'object' &&
        user.id &&
        user.username &&
        typeof user.username === 'string';
}

// Handle authentication errors globally
function handleAuthError(error) {
    console.error('Authentication error:', error);
    Auth.clearAuth();
    showAuthModal();
    const fab = document.getElementById('addExpenseBtn');
    if (fab) fab.style.display = 'none';
    const usernameGreeting = document.getElementById('usernameGreeting');
    if (usernameGreeting) usernameGreeting.style.display = 'none';
}

// Export expenses to CSV
async function exportExpensesToCSV() {
    try {
        const allExpenses = await API.getExpenses();

        if (allExpenses.length === 0) {
            UI.showToast('No expenses to export', 'error');
            return;
        }

        const headers = ['Date', 'Amount', 'Category', 'Where', 'Note'];
        const csvRows = [headers.join(',')];

        allExpenses.forEach(expense => {
            const row = [
                expense.date,
                expense.amount,
                `"${expense.categoryName}"`,
                `"${expense.whereSpent || ''}"`,
                `"${(expense.note || '').replace(/"/g, '""')}"`
            ];
            csvRows.push(row.join(','));
        });

        const csvContent = csvRows.join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);

        const filename = `expenses_${new Date().toISOString().split('T')[0]}.csv`;
        link.setAttribute('href', url);
        link.setAttribute('download', filename);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        UI.showToast(`Exported ${allExpenses.length} expenses`, 'success');
    } catch (error) {
        console.error('Export error:', error);
        UI.showToast('Failed to export expenses', 'error');
    }
}

// ===================================
// API FUNCTIONS
// ===================================
const API = {
    getAuthHeaders() {
        const headers = { 'Content-Type': 'application/json' };
        const token = Auth.getToken();
        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }
        return headers;
    },

    async getCategories() {
        const response = await fetch('/api/categories', {
            headers: this.getAuthHeaders()
        });
        if (!response.ok) throw new Error('Failed to fetch categories');
        return response.json();
    },

    async getExpenses(month, year) {
        const params = new URLSearchParams();
        if (month) params.append('month', month);
        if (year) params.append('year', year);

        const response = await fetch(`/api/expenses?${params}`, {
            headers: this.getAuthHeaders()
        });
        if (response.status === 401 || response.status === 403) {
            throw new Error('Authentication required');
        }
        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            throw new Error(error.error || 'Failed to fetch expenses');
        }
        return response.json();
    },

    async createExpense(expenseData) {
        const response = await fetch('/api/expenses', {
            method: 'POST',
            headers: this.getAuthHeaders(),
            body: JSON.stringify(expenseData)
        });
        if (response.status === 401 || response.status === 403) {
            throw new Error('Authentication required');
        }
        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            throw new Error(error.error || 'Failed to create expense');
        }
        return response.json();
    },

    async updateExpense(id, expenseData) {
        const response = await fetch(`/api/expenses/${id}`, {
            method: 'PUT',
            headers: this.getAuthHeaders(),
            body: JSON.stringify(expenseData)
        });
        if (response.status === 401 || response.status === 403) {
            throw new Error('Authentication required');
        }
        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            throw new Error(error.error || 'Failed to update expense');
        }
        return response.json();
    },

    async deleteExpense(id) {
        const response = await fetch(`/api/expenses/${id}`, {
            method: 'DELETE',
            headers: this.getAuthHeaders()
        });
        if (response.status === 401 || response.status === 403) {
            throw new Error('Authentication required');
        }
        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            throw new Error(error.error || 'Failed to delete expense');
        }
        return response.json();
    },

    async createCategory(categoryData) {
        const response = await fetch('/api/categories', {
            method: 'POST',
            headers: this.getAuthHeaders(),
            body: JSON.stringify(categoryData)
        });
        if (response.status === 401 || response.status === 403) {
            throw new Error('Authentication required');
        }
        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            throw new Error(error.error || 'Failed to create category');
        }
        return response.json();
    },

    async getMonthlySummary(year, month) {
        const response = await fetch(`/api/summary/${year}/${month}`, {
            headers: this.getAuthHeaders()
        });
        if (response.status === 401 || response.status === 403) {
            throw new Error('Authentication required');
        }
        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            throw new Error(error.error || 'Failed to fetch summary');
        }
        return response.json();
    },

    async getYearlySummary(year) {
        const response = await fetch(`/api/summary/year/${year}`, {
            headers: this.getAuthHeaders()
        });
        if (response.status === 401 || response.status === 403) {
            throw new Error('Authentication required');
        }
        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            throw new Error(error.error || 'Failed to fetch yearly summary');
        }
        return response.json();
    },

    // Income API functions
    async getIncomeCategories() {
        const response = await fetch('/api/income-categories', {
            headers: this.getAuthHeaders()
        });
        if (!response.ok) throw new Error('Failed to fetch income categories');
        return response.json();
    },

    async getIncomes(month, year) {
        const params = new URLSearchParams();
        if (month) params.append('month', month);
        if (year) params.append('year', year);

        const response = await fetch(`/api/incomes?${params}`, {
            headers: this.getAuthHeaders()
        });
        if (response.status === 401 || response.status === 403) {
            throw new Error('Authentication required');
        }
        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            throw new Error(error.error || 'Failed to fetch incomes');
        }
        return response.json();
    },

    async createIncome(incomeData) {
        const response = await fetch('/api/incomes', {
            method: 'POST',
            headers: this.getAuthHeaders(),
            body: JSON.stringify(incomeData)
        });
        if (response.status === 401 || response.status === 403) {
            throw new Error('Authentication required');
        }
        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            throw new Error(error.error || 'Failed to create income');
        }
        return response.json();
    },

    async updateIncome(id, incomeData) {
        const response = await fetch(`/api/incomes/${id}`, {
            method: 'PUT',
            headers: this.getAuthHeaders(),
            body: JSON.stringify(incomeData)
        });
        if (response.status === 401 || response.status === 403) {
            throw new Error('Authentication required');
        }
        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            throw new Error(error.error || 'Failed to update income');
        }
        return response.json();
    },

    async deleteIncome(id) {
        const response = await fetch(`/api/incomes/${id}`, {
            method: 'DELETE',
            headers: this.getAuthHeaders()
        });
        if (response.status === 401 || response.status === 403) {
            throw new Error('Authentication required');
        }
        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            throw new Error(error.error || 'Failed to delete income');
        }
        return response.json();
    },

    async createIncomeCategory(categoryData) {
        const response = await fetch('/api/income-categories', {
            method: 'POST',
            headers: this.getAuthHeaders(),
            body: JSON.stringify(categoryData)
        });
        if (response.status === 401 || response.status === 403) {
            throw new Error('Authentication required');
        }
        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            throw new Error(error.error || 'Failed to create income category');
        }
        return response.json();
    },

    async getIncomeMonthlySummary(year, month) {
        const response = await fetch(`/api/income-summary/${year}/${month}`, {
            headers: this.getAuthHeaders()
        });
        if (response.status === 401 || response.status === 403) {
            throw new Error('Authentication required');
        }
        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            throw new Error(error.error || 'Failed to fetch income summary');
        }
        return response.json();
    },

    async getIncomeYearlySummary(year) {
        const response = await fetch(`/api/income-summary/year/${year}`, {
            headers: this.getAuthHeaders()
        });
        if (response.status === 401 || response.status === 403) {
            throw new Error('Authentication required');
        }
        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            throw new Error(error.error || 'Failed to fetch yearly income summary');
        }
        return response.json();
    },

    // Account API functions
    async getAccounts() {
        const response = await fetch('/api/accounts', {
            headers: this.getAuthHeaders()
        });
        if (response.status === 401 || response.status === 403) {
            throw new Error('Authentication required');
        }
        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            throw new Error(error.error || 'Failed to fetch accounts');
        }
        return response.json();
    },

    async getAccountTypes() {
        const response = await fetch('/api/accounts/types', {
            headers: this.getAuthHeaders()
        });
        if (!response.ok) throw new Error('Failed to fetch account types');
        return response.json();
    },

    async getDefaultAccount() {
        const response = await fetch('/api/accounts/default', {
            headers: this.getAuthHeaders()
        });
        if (response.status === 401 || response.status === 403) {
            throw new Error('Authentication required');
        }
        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            throw new Error(error.error || 'Failed to fetch default account');
        }
        return response.json();
    },

    async createAccount(accountData) {
        const response = await fetch('/api/accounts', {
            method: 'POST',
            headers: this.getAuthHeaders(),
            body: JSON.stringify(accountData)
        });
        if (response.status === 401 || response.status === 403) {
            throw new Error('Authentication required');
        }
        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            throw new Error(error.error || 'Failed to create account');
        }
        return response.json();
    },

    async updateAccount(id, accountData) {
        const response = await fetch(`/api/accounts/${id}`, {
            method: 'PUT',
            headers: this.getAuthHeaders(),
            body: JSON.stringify(accountData)
        });
        if (response.status === 401 || response.status === 403) {
            throw new Error('Authentication required');
        }
        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            throw new Error(error.error || 'Failed to update account');
        }
        return response.json();
    },

    async deleteAccount(id) {
        const response = await fetch(`/api/accounts/${id}`, {
            method: 'DELETE',
            headers: this.getAuthHeaders()
        });
        if (response.status === 401 || response.status === 403) {
            throw new Error('Authentication required');
        }
        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            throw new Error(error.error || 'Failed to delete account');
        }
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
        localStorage.setItem('currentView', viewName);

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
            document.getElementById('account').value = expense.accountId || (state.defaultAccount ? state.defaultAccount.id : '');
            document.getElementById('where').value = expense.whereSpent || '';
            document.getElementById('note').value = expense.note || '';
        } else {
            // Add Mode
            state.currentExpenseId = null;
            title.textContent = 'Add Expense';
            btn.textContent = 'Add Expense';
            form.reset();
            document.getElementById('date').valueAsDate = new Date();
            // Set default account
            if (state.defaultAccount) {
                document.getElementById('account').value = state.defaultAccount.id;
            }
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

    openIncomeModal(income = null) {
        const modal = document.getElementById('incomeModal');
        const title = document.querySelector('#incomeModal .modal-title');
        const form = document.getElementById('incomeForm');
        const saveBtn = document.getElementById('saveIncomeBtn');

        if (income) {
            // Edit mode
            state.currentIncomeId = income.id;
            title.textContent = 'Edit Income';
            saveBtn.textContent = 'Update Income';

            document.getElementById('incomeAmount').value = income.amount;
            document.getElementById('incomeDate').value = income.date;
            document.getElementById('incomeCategory').value = income.categoryId;
            document.getElementById('incomeAccount').value = income.accountId || (state.defaultAccount ? state.defaultAccount.id : '');
            document.getElementById('source').value = income.source || '';
            document.getElementById('incomeNote').value = income.note || '';
        } else {
            // Add mode
            state.currentIncomeId = null;
            title.textContent = 'Add Income';
            saveBtn.textContent = 'Add Income';
            document.getElementById('incomeDate').valueAsDate = new Date();
            // Set default account
            if (state.defaultAccount) {
                document.getElementById('incomeAccount').value = state.defaultAccount.id;
            }
        }

        modal.classList.add('active');
        document.getElementById('incomeAmount').focus();
    },

    closeIncomeModal() {
        const modal = document.getElementById('incomeModal');
        modal.classList.remove('active');
        document.getElementById('incomeForm').reset();
        state.currentIncomeId = null;
    },

    openIncomeCategoryModal() {
        const modal = document.getElementById('incomeCategoryModal');
        modal.classList.add('active');
        document.getElementById('incomeCatName').focus();
    },

    closeIncomeCategoryModal() {
        const modal = document.getElementById('incomeCategoryModal');
        modal.classList.remove('active');
        document.getElementById('incomeCategoryForm').reset();
    },

    openAccountModal() {
        const modal = document.getElementById('accountModal');
        modal.classList.add('active');
        // Populate account types when modal opens
        populateAccountTypes();
        document.getElementById('accountName').focus();
    },

    closeAccountModal() {
        const modal = document.getElementById('accountModal');
        modal.classList.remove('active');
        document.getElementById('accountForm').reset();
    },

    renderTransactionItem(expense, showDelete = true) {
        const item = document.createElement('div');
        item.className = 'transaction-item';

        const accountBadge = expense.accountName ? 
            `<div class="account-badge" style="background: ${expense.accountColor}20; border-color: ${expense.accountColor};">
                <span class="account-icon">${expense.accountIcon}</span>
                <span class="account-name">${expense.accountName}</span>
            </div>` : '';

        item.innerHTML = `
      <div class="transaction-icon" style="border-color: ${expense.categoryColor}; background: ${expense.categoryColor}20;">
        ${expense.categoryIcon}
      </div>
      <div class="transaction-details">
        <div class="transaction-category">${expense.whereSpent || 'Unknown'}</div>
        ${expense.note ? `<div class="transaction-note">${expense.note}</div>` : ''}
        <div class="transaction-meta">
          <span class="transaction-date">${UI.formatDate(expense.date)}</span>
          ${accountBadge}
        </div>
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

    renderIncomeItem(income, showDelete = true) {
        const item = document.createElement('div');
        item.className = 'transaction-item income-item';

        const accountBadge = income.accountName ? 
            `<div class="account-badge" style="background: ${income.accountColor}20; border-color: ${income.accountColor};">
                <span class="account-icon">${income.accountIcon}</span>
                <span class="account-name">${income.accountName}</span>
            </div>` : '';

        item.innerHTML = `
      <div class="transaction-icon" style="border-color: ${income.categoryColor}; background: ${income.categoryColor}20;">
        ${income.categoryIcon}
      </div>
      <div class="transaction-details">
        <div class="transaction-category">${income.source || 'Unknown'}</div>
        ${income.note ? `<div class="transaction-note">${income.note}</div>` : ''}
        <div class="transaction-meta">
          <span class="transaction-date">${UI.formatDate(income.date)}</span>
          ${accountBadge}
        </div>
      </div>
      <div class="transaction-amount income-amount">${UI.formatCurrency(income.amount)}</div>
      ${showDelete ? `<button class="transaction-delete" data-id="${income.id}">Delete</button>` : ''}
    `;

        // Add edit handler (click on item)
        item.addEventListener('click', () => {
            UI.openIncomeModal(income);
        });

        // Add delete handler
        if (showDelete) {
            const deleteBtn = item.querySelector('.transaction-delete');
            deleteBtn.addEventListener('click', async (e) => {
                e.stopPropagation(); // Prevent edit modal from opening
                if (confirm('Delete this income?')) {
                    await handleDeleteIncome(income.id);
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
        const recentList = document.getElementById('recentList');
        recentList.innerHTML = '';

        if (state.viewType === 'expense') {
            const summary = await API.getMonthlySummary(state.currentYear, state.currentMonth);
            const expenses = await API.getExpenses(state.currentMonth, state.currentYear);

            document.getElementById('monthlyTotal').textContent = UI.formatCurrency(summary.total);
            document.getElementById('monthlySublabel').textContent =
                `${expenses.length} transaction${expenses.length !== 1 ? 's' : ''}`;

            if (expenses.length === 0) {
                recentList.innerHTML = UI.renderEmptyState('No expenses this month', '💸');
            } else {
                const recentExpenses = expenses.slice(0, 5);
                recentExpenses.forEach(expense => {
                    recentList.appendChild(UI.renderTransactionItem(expense, false));
                });
            }
        } else {
            const summary = await API.getIncomeMonthlySummary(state.currentYear, state.currentMonth);
            const incomes = await API.getIncomes(state.currentMonth, state.currentYear);

            document.getElementById('monthlyTotal').textContent = UI.formatCurrency(summary.total);
            document.getElementById('monthlySublabel').textContent =
                `${incomes.length} transaction${incomes.length !== 1 ? 's' : ''}`;

            if (incomes.length === 0) {
                recentList.innerHTML = UI.renderEmptyState('No income this month', '💰');
            } else {
                const recentIncomes = incomes.slice(0, 5);
                recentIncomes.forEach(income => {
                    recentList.appendChild(UI.renderIncomeItem(income, false));
                });
            }
        }
    } catch (error) {
        console.error('Error loading home view:', error);
        if (error.message === 'Authentication required') {
            handleAuthError(error);
        } else {
            UI.showToast('Failed to load data', 'error');
        }
    }
}

async function loadHistoryView() {
    try {
        const historyList = document.getElementById('historyList');
        historyList.innerHTML = '';

        if (state.viewType === 'expense') {
            const expenses = await API.getExpenses(state.currentMonth, state.currentYear);

            if (expenses.length === 0) {
                historyList.innerHTML = UI.renderEmptyState('No expenses found', '🔍');
            } else {
                expenses.forEach(expense => {
                    historyList.appendChild(UI.renderTransactionItem(expense, true));
                });
            }
        } else {
            const incomes = await API.getIncomes(state.currentMonth, state.currentYear);

            if (incomes.length === 0) {
                historyList.innerHTML = UI.renderEmptyState('No income found', '🔍');
            } else {
                incomes.forEach(income => {
                    historyList.appendChild(UI.renderIncomeItem(income, true));
                });
            }
        }
    } catch (error) {
        console.error('Error loading history view:', error);
        if (error.message === 'Authentication required') {
            handleAuthError(error);
        } else {
            UI.showToast('Failed to load history', 'error');
        }
    }
}

async function loadAnalyticsView() {
    try {
        // Load yearly chart data
        try {
            await loadYearlyChart();
        } catch (yearlyError) {
            console.error('Error loading yearly chart:', yearlyError);
            // Continue to load monthly breakdown even if yearly fails
        }

        // Load monthly category breakdown
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
        if (error.message === 'Authentication required') {
            handleAuthError(error);
        } else {
            UI.showToast('Failed to load analytics', 'error');
        }
    }
}

async function loadYearlyChart() {
    try {
        const yearSelector = document.getElementById('yearSelector');

        // Populate year selector if empty
        if (yearSelector.options.length === 0) {
            const currentYear = new Date().getFullYear();
            for (let year = currentYear; year >= currentYear - 5; year--) {
                const option = document.createElement('option');
                option.value = year;
                option.textContent = year;
                yearSelector.appendChild(option);
            }
            yearSelector.value = state.currentYear;
        }

        // Always fetch fresh data
        const selectedYear = parseInt(yearSelector.value);
        console.log('Fetching yearly summary for year:', selectedYear, 'type:', state.analyticsChartType);
        
        let yearlySummary;
        if (state.analyticsChartType === 'expense') {
            yearlySummary = await API.getYearlySummary(selectedYear);
        } else if (state.analyticsChartType === 'income') {
            yearlySummary = await API.getIncomeYearlySummary(selectedYear);
        } else if (state.analyticsChartType === 'net') {
            // Fetch both expense and income data
            const [expenseSummary, incomeSummary] = await Promise.all([
                API.getYearlySummary(selectedYear),
                API.getIncomeYearlySummary(selectedYear)
            ]);
            
            // Calculate net (income - expenses) for each month
            yearlySummary = {
                year: selectedYear,
                total: incomeSummary.total - expenseSummary.total,
                months: expenseSummary.months.map((expenseMonth, index) => {
                    const incomeMonth = incomeSummary.months[index];
                    return {
                        month: expenseMonth.month,
                        monthName: expenseMonth.monthName,
                        total: incomeMonth.total - expenseMonth.total,
                        count: expenseMonth.count + incomeMonth.count,
                        incomeTotal: incomeMonth.total,
                        expenseTotal: expenseMonth.total
                    };
                })
            };
        }
        
        console.log('Yearly summary received:', yearlySummary);
        renderYearlyChart(yearlySummary);
    } catch (error) {
        console.error('Error in loadYearlyChart:', error);
        throw error;
    }
}

function renderYearlyChart(data) {
    const yearlyTotalEl = document.getElementById('yearlyTotal');
    const monthlyBarsEl = document.getElementById('monthlyBars');

    // Format total with color based on chart type
    if (state.analyticsChartType === 'net') {
        const formattedTotal = UI.formatCurrency(Math.abs(data.total));
        const sign = data.total >= 0 ? '+' : '-';
        const color = data.total >= 0 ? '#4CAF50' : '#f44336';
        yearlyTotalEl.innerHTML = `<span style="color: ${color}">${sign}${formattedTotal}</span>`;
    } else {
        yearlyTotalEl.textContent = UI.formatCurrency(data.total);
    }
    
    monthlyBarsEl.innerHTML = '';

    // Find max absolute amount for scaling (to handle negative values in net view)
    const maxAmount = Math.max(...data.months.map(m => Math.abs(m.total)), 1);

    data.months.forEach(monthData => {
        const isNegative = monthData.total < 0;
        const heightPercent = maxAmount > 0 ? (Math.abs(monthData.total) / maxAmount * 100) : 0;

        const barEl = document.createElement('div');
        barEl.className = 'month-bar';
        if (state.analyticsChartType === 'net') {
            barEl.className += isNegative ? ' month-bar-negative' : ' month-bar-positive';
        } else if (state.analyticsChartType === 'income') {
            barEl.className += ' month-bar-income';
        }
        barEl.dataset.month = monthData.month;
        barEl.dataset.year = data.year;

        // Tooltip content varies based on chart type
        let tooltipContent = '';
        if (state.analyticsChartType === 'net') {
            tooltipContent = `
                Net: ${UI.formatCurrency(monthData.total)}<br>
                Income: ${UI.formatCurrency(monthData.incomeTotal || 0)}<br>
                Expenses: ${UI.formatCurrency(monthData.expenseTotal || 0)}<br>
                ${monthData.count} transaction${monthData.count !== 1 ? 's' : ''}
            `;
        } else {
            tooltipContent = `
                ${UI.formatCurrency(monthData.total)}<br>
                ${monthData.count} transaction${monthData.count !== 1 ? 's' : ''}
            `;
        }

        barEl.innerHTML = `
            <div class="month-bar-container">
                <div class="month-bar-fill" style="height: ${heightPercent}%;">
                    <div class="month-bar-amount">${monthData.total !== 0 ? (isNegative && state.analyticsChartType === 'net' ? '-' : '') + UI.formatCurrency(Math.abs(monthData.total)) : '₹0'}</div>
                </div>
            </div>
            <div class="month-bar-label">${monthData.monthName}</div>
            <div class="month-bar-tooltip">${tooltipContent}</div>
        `;

        // Click handler to filter by month
        barEl.addEventListener('click', () => {
            state.currentMonth = monthData.month;
            state.currentYear = data.year;
            UI.switchView('home');
            populateMonthFilter();
            loadHomeView();
        });

        monthlyBarsEl.appendChild(barEl);
    });
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
        accountId: parseInt(formData.get('accountId')),
        whereSpent: formData.get('whereSpent'),
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
        if (error.message === 'Authentication required') {
            handleAuthError(error);
        } else {
            UI.showToast(error.message || 'Failed to save expense', 'error');
        }
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
        if (error.message === 'Authentication required') {
            handleAuthError(error);
        } else {
            UI.showToast(error.message || 'Failed to create category', 'error');
        }
    }
}

async function handleSaveIncome(event) {
    event.preventDefault();

    const formData = new FormData(event.target);
    const incomeData = {
        amount: parseFloat(formData.get('amount')),
        date: formData.get('date'),
        categoryId: parseInt(formData.get('categoryId')),
        accountId: parseInt(formData.get('accountId')),
        source: formData.get('source'),
        note: formData.get('note') || ''
    };

    try {
        if (state.currentIncomeId) {
            await API.updateIncome(state.currentIncomeId, incomeData);
            UI.showToast('Income updated successfully!', 'success');
        } else {
            await API.createIncome(incomeData);
            UI.showToast('Income added successfully!', 'success');
        }

        UI.closeIncomeModal();
        UI.switchView(state.currentView);
    } catch (error) {
        console.error('Error saving income:', error);
        if (error.message === 'Authentication required') {
            handleAuthError(error);
        } else {
            UI.showToast(error.message || 'Failed to save income', 'error');
        }
    }
}

async function handleSaveIncomeCategory(event) {
    event.preventDefault();

    const formData = new FormData(event.target);
    const categoryData = {
        name: formData.get('name'),
        icon: formData.get('icon'),
        hexColor: formData.get('hexColor')
    };

    try {
        await API.createIncomeCategory(categoryData);
        UI.showToast('Income category created!', 'success');

        // Refresh dropdown
        await populateIncomeCategorySelect();
        UI.closeIncomeCategoryModal();
    } catch (error) {
        console.error('Error creating income category:', error);
        if (error.message === 'Authentication required') {
            handleAuthError(error);
        } else {
            UI.showToast(error.message || 'Failed to create income category', 'error');
        }
    }
}

async function handleDeleteIncome(id) {
    try {
        await API.deleteIncome(id);
        UI.showToast('Income deleted', 'success');
        UI.switchView(state.currentView);
    } catch (error) {
        console.error('Error deleting income:', error);
        if (error.message === 'Authentication required') {
            handleAuthError(error);
        } else {
            UI.showToast(error.message || 'Failed to delete income', 'error');
        }
    }
}

async function handleSaveAccount(event) {
    event.preventDefault();

    const formData = new FormData(event.target);
    const accountData = {
        name: formData.get('name'),
        type: formData.get('type'),
        icon: formData.get('icon'),
        hexColor: formData.get('hexColor'),
        isDefault: formData.get('isDefault') ? 1 : 0
    };

    try {
        await API.createAccount(accountData);
        UI.showToast('Account created!', 'success');

        // Refresh account dropdowns
        await populateAccountSelect();
        UI.closeAccountModal();
    } catch (error) {
        console.error('Error creating account:', error);
        if (error.message === 'Authentication required') {
            handleAuthError(error);
        } else {
            UI.showToast(error.message || 'Failed to create account', 'error');
        }
    }
}


// ===================================
// AUTH HANDLERS
// ===================================
function showAuthModal() {
    const modal = document.getElementById('authModal');
    const app = document.getElementById('app');
    const fab = document.getElementById('addExpenseBtn');
    const logoutBtn = document.getElementById('logoutBtn');
    const usernameGreeting = document.getElementById('usernameGreeting');

    modal.style.display = 'flex';
    app.style.display = 'none';
    if (fab) {
        fab.style.display = 'none';
        fab.style.visibility = 'hidden';
    }
    if (logoutBtn) logoutBtn.style.display = 'none';
    if (usernameGreeting) usernameGreeting.style.display = 'none';
}

function hideAuthModal() {
    const modal = document.getElementById('authModal');
    modal.style.display = 'none';
    // Note: app.style.display will be set by initApp() after data loads
}

function switchAuthTab(tab) {
    const loginForm = document.getElementById('loginForm');
    const registerForm = document.getElementById('registerForm');
    const title = document.getElementById('authModalTitle');
    const tabs = document.querySelectorAll('.auth-tab');

    tabs.forEach(t => t.classList.remove('active'));
    document.querySelector(`[data-tab="${tab}"]`).classList.add('active');

    if (tab === 'login') {
        title.textContent = 'Welcome Back';
        loginForm.style.display = 'block';
        registerForm.style.display = 'none';
    } else {
        title.textContent = 'Create Account';
        loginForm.style.display = 'none';
        registerForm.style.display = 'block';
    }
}

async function handleLogin(event) {
    event.preventDefault();

    const formData = new FormData(event.target);
    const username = formData.get('username');
    const password = formData.get('password');

    try {
        console.log('Login attempt for:', username);
        await Auth.login(username, password);
        console.log('Login successful, hiding auth modal');
        hideAuthModal();
        console.log('Auth modal hidden, showing toast');
        UI.showToast(`Welcome back, ${username}!`, 'success');
        console.log('About to call initApp');
        await initApp();
        console.log('initApp completed');
    } catch (error) {
        console.error('Login error:', error);
        UI.showToast(error.message, 'error');
    }
}

async function handleRegister(event) {
    event.preventDefault();

    const formData = new FormData(event.target);
    const username = formData.get('username');
    const password = formData.get('password');
    const passwordConfirm = formData.get('passwordConfirm');

    if (password !== passwordConfirm) {
        UI.showToast('Passwords do not match', 'error');
        return;
    }

    try {
        await Auth.register(username, password);
        hideAuthModal();
        UI.showToast(`Welcome, ${username}!`, 'success');
        await initApp();
    } catch (error) {
        console.error('Registration error:', error);
        UI.showToast(error.message, 'error');
    }
}

function handleLogout() {
    if (confirm('Are you sure you want to logout?')) {
        // Hide username greeting
        const usernameGreeting = document.getElementById('usernameGreeting');
        if (usernameGreeting) {
            usernameGreeting.style.display = 'none';
        }
        Auth.logout();
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

async function populateIncomeCategorySelect() {
    try {
        const categories = await API.getIncomeCategories();
        state.incomeCategories = categories;

        const select = document.getElementById('incomeCategory');
        // Save current selection if re-populating
        const currentVal = select.value;

        select.innerHTML = categories.map(cat =>
            `<option value="${cat.id}">${cat.icon} ${cat.name}</option>`
        ).join('');

        if (currentVal && categories.find(c => c.id == currentVal)) {
            select.value = currentVal;
        }
    } catch (error) {
        console.error('Error loading income categories:', error);
    }
}

async function populateAccountSelect() {
    try {
        const accounts = await API.getAccounts();
        state.accounts = accounts;

        // Get default account
        const defaultAccount = await API.getDefaultAccount();
        state.defaultAccount = defaultAccount;

        const expenseSelect = document.getElementById('account');
        const incomeSelect = document.getElementById('incomeAccount');

        // Save current selections if re-populating
        const currentExpenseVal = expenseSelect ? expenseSelect.value : null;
        const currentIncomeVal = incomeSelect ? incomeSelect.value : null;

        const optionsHTML = accounts.map(acc =>
            `<option value="${acc.id}">${acc.icon} ${acc.name} (${acc.type})</option>`
        ).join('');

        if (expenseSelect) {
            expenseSelect.innerHTML = optionsHTML;
            if (currentExpenseVal && accounts.find(a => a.id == currentExpenseVal)) {
                expenseSelect.value = currentExpenseVal;
            } else if (defaultAccount) {
                expenseSelect.value = defaultAccount.id;
            }
        }

        if (incomeSelect) {
            incomeSelect.innerHTML = optionsHTML;
            if (currentIncomeVal && accounts.find(a => a.id == currentIncomeVal)) {
                incomeSelect.value = currentIncomeVal;
            } else if (defaultAccount) {
                incomeSelect.value = defaultAccount.id;
            }
        }
    } catch (error) {
        console.error('Error loading accounts:', error);
    }
}

async function populateAccountTypes() {
    try {
        const types = await API.getAccountTypes();
        const select = document.getElementById('accountType');

        select.innerHTML = types.map(type =>
            `<option value="${type.value}">${type.icon} ${type.label}</option>`
        ).join('');
        
        // Auto-fill icon when type changes (remove old listener first)
        const newSelect = select.cloneNode(true);
        select.parentNode.replaceChild(newSelect, select);
        
        newSelect.addEventListener('change', (e) => {
            const selectedType = types.find(t => t.value === e.target.value);
            if (selectedType) {
                document.getElementById('accountIcon').value = selectedType.icon;
            }
        });
    } catch (error) {
        console.error('Error loading account types:', error);
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

    // View toggle buttons (Expense/Income switcher)
    document.querySelectorAll('.view-toggle-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            // Update view type
            state.viewType = btn.dataset.type;
            
            // Update active toggle buttons
            document.querySelectorAll('.view-toggle-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll(`.view-toggle-btn[data-type="${state.viewType}"]`).forEach(b => b.classList.add('active'));
            
            // Update FAB
            updateFAB();
            
            // Reload current view
            UI.switchView(state.currentView);
        });
    });

    // FAB & Buttons
    document.getElementById('addExpenseBtn').addEventListener('click', () => {
        if (state.viewType === 'expense') {
            UI.openModal();
        } else {
            UI.openIncomeModal();
        }
    });
    document.getElementById('addCategoryBtn').addEventListener('click', UI.openCategoryModal);
    document.getElementById('addIncomeCategoryBtn').addEventListener('click', UI.openIncomeCategoryModal);
    document.getElementById('addAccountBtn').addEventListener('click', UI.openAccountModal);
    document.getElementById('addIncomeAccountBtn').addEventListener('click', UI.openAccountModal);

    // Modals - Expense
    document.getElementById('closeModal').addEventListener('click', UI.closeModal);
    document.querySelector('#expenseModal .modal-backdrop').addEventListener('click', UI.closeModal);

    document.getElementById('closeCategoryModal').addEventListener('click', UI.closeCategoryModal);
    document.querySelector('#categoryModal .modal-backdrop').addEventListener('click', UI.closeCategoryModal);

    // Modals - Account
    document.getElementById('closeAccountModal').addEventListener('click', UI.closeAccountModal);
    document.querySelector('#accountModal .modal-backdrop').addEventListener('click', UI.closeAccountModal);

    // Modals - Income
    document.getElementById('closeIncomeModal').addEventListener('click', UI.closeIncomeModal);
    document.querySelector('#incomeModal .modal-backdrop').addEventListener('click', UI.closeIncomeModal);

    document.getElementById('closeIncomeCategoryModal').addEventListener('click', UI.closeIncomeCategoryModal);
    document.querySelector('#incomeCategoryModal .modal-backdrop').addEventListener('click', UI.closeIncomeCategoryModal);

    // Forms
    document.getElementById('expenseForm').addEventListener('submit', handleSaveExpense);
    document.getElementById('categoryForm').addEventListener('submit', handleSaveCategory);
    document.getElementById('incomeForm').addEventListener('submit', handleSaveIncome);
    document.getElementById('incomeCategoryForm').addEventListener('submit', handleSaveIncomeCategory);
    document.getElementById('accountForm').addEventListener('submit', handleSaveAccount);

    // Auth
    document.querySelectorAll('.auth-tab').forEach(tab => {
        tab.addEventListener('click', () => switchAuthTab(tab.dataset.tab));
    });
    document.getElementById('loginForm').addEventListener('submit', handleLogin);
    document.getElementById('registerForm').addEventListener('submit', handleRegister);
    document.getElementById('logoutBtn').addEventListener('click', handleLogout);
    document.getElementById('exportBtn').addEventListener('click', exportExpensesToCSV);

    // Year selector for analytics
    document.getElementById('yearSelector').addEventListener('change', async () => {
        await loadYearlyChart();
    });

    // Analytics chart type toggle
    document.querySelectorAll('.analytics-toggle-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            state.analyticsChartType = btn.dataset.chartType;
            
            // Update active state
            document.querySelectorAll('.analytics-toggle-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            // Reload chart
            await loadYearlyChart();
        });
    });

    document.getElementById('date').valueAsDate = new Date();
    document.getElementById('incomeDate').valueAsDate = new Date();
}

// Update FAB based on current view type
function updateFAB() {
    const fab = document.getElementById('addExpenseBtn');
    if (fab) {
        if (state.viewType === 'income') {
            fab.setAttribute('aria-label', 'Add Income');
        } else {
            fab.setAttribute('aria-label', 'Add Expense');
        }
    }
}

async function initApp() {
    console.log('=== INITAPP CALLED ===');
    // Called after successful auth verification
    try {
        const fab = document.getElementById('addExpenseBtn');
        const logoutBtn = document.getElementById('logoutBtn');
        const usernameGreeting = document.getElementById('usernameGreeting');

        // Validate user data before proceeding
        if (!validateUserData(state.currentUser)) {
            throw new Error('Invalid user data');
        }

        // Show logout button
        if (logoutBtn) logoutBtn.style.display = 'block';

        // Show export button
        const exportBtn = document.getElementById('exportBtn');
        if (exportBtn) exportBtn.style.display = 'block';

        // Display username greeting (data already verified)
        if (usernameGreeting) {
            usernameGreeting.textContent = `Hi ${state.currentUser.username}!`;
            usernameGreeting.style.display = 'block';
            console.log('Username greeting displayed:', state.currentUser.username);
        }

        // Show FAB
        if (fab) {
            fab.style.display = 'flex';
            fab.style.visibility = 'visible';
            fab.style.opacity = '1';
            console.log('FAB displayed');
        }

        // Load initial data
        try {
            await populateCategorySelect();
            await populateIncomeCategorySelect();
            await populateAccountSelect();
            
            // Safety check - if no accounts loaded, something is wrong
            if (!state.accounts || state.accounts.length === 0) {
                console.error('Failed to load accounts - forcing re-authentication');
                throw new Error('Failed to load critical data');
            }
        } catch (error) {
            console.error('Error loading initial data:', error);
            Auth.clearAuth();
            throw error;
        }
        
        populateMonthFilter();

        // Load the last viewed page (or home by default)
        UI.switchView(state.currentView);

        // Show app container after everything is loaded
        const appContainer = document.getElementById('app');
        appContainer.style.display = 'flex';
        console.log('App initialized successfully');
    } catch (error) {
        console.error('Error initializing app:', error);
        handleAuthError(error);
    }
}

async function init() {
    console.log('=== INIT CALLED ===');

    // Hide app content initially
    const appContainer = document.getElementById('app');
    const authModal = document.getElementById('authModal');
    
    if (appContainer) appContainer.style.display = 'none';
    if (authModal) authModal.style.display = 'none';

    try {
        UI.updateCurrentDate();
        initEventListeners();
    } catch (error) {
        console.error('Error in updateCurrentDate or initEventListeners:', error);
    }

    // Verify authentication state
    console.log('Checking authentication state...');
    console.log('Current auth token:', state.authToken ? 'EXISTS' : 'NONE');

    if (state.authToken) {
        // Token exists, verify it with the server
        console.log('Token found, verifying with server...');
        try {
            const user = await Auth.verifyToken();

            if (user && validateUserData(user)) {
                // Valid token and user data
                console.log('Token verified, user authenticated:', user.username);
                try {
                    await initApp();
                } catch (error) {
                    console.error('Error initializing app:', error);
                    handleAuthError(error);
                }
            } else {
                // Invalid token or user data
                console.log('Token verification failed, showing login');
                showAuthModal();
            }
        } catch (error) {
            console.error('Token verification error:', error);
            showAuthModal();
        }
    } else {
        // No token, show login
        console.log('No token found, showing auth modal');
        showAuthModal();
    }

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
