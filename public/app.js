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
    investments: [],
    investmentResults: null,
    investmentType: 'nasdaq', // 'nasdaq', 'mutual-funds', 'crypto'
    fixedDeposits: [],
    currentFDId: null,
    pfEntries: [],
    pfSummary: null,
    pfFinancialYears: [],
    pfFilters: { type: '', financialYear: '' },
    currentView: localStorage.getItem('currentView') || 'home',
    viewType: 'expense', // 'expense' or 'income'
    analyticsChartType: 'expense', // 'expense', 'income', or 'net'
    currentMonth: new Date().getMonth() + 1,
    currentYear: new Date().getFullYear(),
    currentExpenseId: null, // Track if we are editing
    currentIncomeId: null,
    currentInvestmentTicker: null, // Track if we are editing
    authToken: localStorage.getItem('authToken') || null,
    currentUser: JSON.parse(localStorage.getItem('currentUser') || 'null'),
    privilegedMode: sessionStorage.getItem('privilegedMode') === 'true',
    hasPin: false
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
        state.privilegedMode = false;
        sessionStorage.removeItem('privilegedMode');
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
    },

    // Investment API functions
    async getInvestments() {
        const response = await fetch('/api/investments', {
            headers: this.getAuthHeaders()
        });
        if (response.status === 401 || response.status === 403) {
            throw new Error('Authentication required');
        }
        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            throw new Error(error.error || 'Failed to fetch investments');
        }
        return response.json();
    },

    async createInvestment(investmentData) {
        const response = await fetch('/api/investments', {
            method: 'POST',
            headers: this.getAuthHeaders(),
            body: JSON.stringify(investmentData)
        });
        if (response.status === 401 || response.status === 403) {
            throw new Error('Authentication required');
        }
        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            throw new Error(error.error || 'Failed to create investment');
        }
        return response.json();
    },

    async deleteInvestment(ticker) {
        const response = await fetch(`/api/investments/${ticker}`, {
            method: 'DELETE',
            headers: this.getAuthHeaders()
        });
        if (response.status === 401 || response.status === 403) {
            throw new Error('Authentication required');
        }
        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            throw new Error(error.error || 'Failed to delete investment');
        }
        return response.json();
    },

    async calculateInvestments() {
        const response = await fetch('/api/investments/calculate', {
            headers: this.getAuthHeaders()
        });
        if (response.status === 401 || response.status === 403) {
            throw new Error('Authentication required');
        }
        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            throw new Error(error.error || 'Failed to calculate investments');
        }
        return response.json();
    },

    // Fixed Deposit API functions
    async getFixedDeposits() {
        const response = await fetch('/api/fixed-deposits', {
            headers: this.getAuthHeaders()
        });
        if (response.status === 401 || response.status === 403) {
            throw new Error('Authentication required');
        }
        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            throw new Error(error.error || 'Failed to fetch fixed deposits');
        }
        return response.json();
    },

    async createFixedDeposit(data) {
        const response = await fetch('/api/fixed-deposits', {
            method: 'POST',
            headers: this.getAuthHeaders(),
            body: JSON.stringify(data)
        });
        if (response.status === 401 || response.status === 403) {
            throw new Error('Authentication required');
        }
        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            throw new Error(error.error || 'Failed to create fixed deposit');
        }
        return response.json();
    },

    async updateFixedDeposit(id, data) {
        const response = await fetch(`/api/fixed-deposits/${id}`, {
            method: 'PUT',
            headers: this.getAuthHeaders(),
            body: JSON.stringify(data)
        });
        if (response.status === 401 || response.status === 403) {
            throw new Error('Authentication required');
        }
        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            throw new Error(error.error || 'Failed to update fixed deposit');
        }
        return response.json();
    },

    async deleteFixedDeposit(id) {
        const response = await fetch(`/api/fixed-deposits/${id}`, {
            method: 'DELETE',
            headers: this.getAuthHeaders()
        });
        if (response.status === 401 || response.status === 403) {
            throw new Error('Authentication required');
        }
        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            throw new Error(error.error || 'Failed to delete fixed deposit');
        }
        return response.json();
    },

    // PF API functions
    async getPFEntries(filters = {}) {
        const params = new URLSearchParams();
        if (filters.type) params.append('type', filters.type);
        if (filters.financialYear) params.append('financialYear', filters.financialYear);

        const response = await fetch(`/api/pf?${params}`, {
            headers: this.getAuthHeaders()
        });
        if (response.status === 401 || response.status === 403) {
            throw new Error('Authentication required');
        }
        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            throw new Error(error.error || 'Failed to fetch PF entries');
        }
        return response.json();
    },

    async createPFEntry(data) {
        const response = await fetch('/api/pf', {
            method: 'POST',
            headers: this.getAuthHeaders(),
            body: JSON.stringify(data)
        });
        if (response.status === 401 || response.status === 403) {
            throw new Error('Authentication required');
        }
        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            throw new Error(error.error || 'Failed to create PF entry');
        }
        return response.json();
    },

    async deletePFEntry(id) {
        const response = await fetch(`/api/pf/${id}`, {
            method: 'DELETE',
            headers: this.getAuthHeaders()
        });
        if (response.status === 401 || response.status === 403) {
            throw new Error('Authentication required');
        }
        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            throw new Error(error.error || 'Failed to delete PF entry');
        }
        return response.json();
    },

    // PIN API functions
    async hasPin() {
        const response = await fetch('/api/auth/has-pin', {
            headers: this.getAuthHeaders()
        });
        if (response.status === 401 || response.status === 403) {
            throw new Error('Authentication required');
        }
        if (!response.ok) {
            throw new Error('Failed to check PIN status');
        }
        return response.json();
    },

    async setPin(password, pin) {
        const response = await fetch('/api/auth/pin', {
            method: 'POST',
            headers: this.getAuthHeaders(),
            body: JSON.stringify({ password, pin })
        });
        if (response.status === 401 || response.status === 403) {
            throw new Error('Authentication required');
        }
        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            throw new Error(error.error || 'Failed to set PIN');
        }
        return response.json();
    },

    async verifyPin(pin) {
        const response = await fetch('/api/auth/verify-pin', {
            method: 'POST',
            headers: this.getAuthHeaders(),
            body: JSON.stringify({ pin })
        });
        if (response.status === 401 || response.status === 403) {
            throw new Error('Authentication required');
        }
        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            throw new Error(error.error || 'Failed to verify PIN');
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
        if (!dateEl) return; // Element removed, skip update
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
        } else if (viewName === 'investments') {
            loadInvestmentsView();
        } else if (viewName === 'settings') {
            loadSettingsView();
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
        // Hide category details and show breakdown
        document.getElementById('categoryDetailsSection').style.display = 'none';
        document.querySelector('.yearly-overview').style.display = 'block';
        document.querySelector('.analytics-summary').style.display = 'block';
        document.querySelector('.chart-section').style.display = 'block';

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
                barEl.style.cursor = 'pointer';
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

                // Add click handler to show category transactions
                barEl.addEventListener('click', () => {
                    loadCategoryTransactions(category.id, category.name, category.icon, category.hexColor);
                });

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

async function loadCategoryTransactions(categoryId, categoryName, categoryIcon, categoryColor) {
    try {
        // Hide breakdown, show category details
        document.querySelector('.yearly-overview').style.display = 'none';
        document.querySelector('.analytics-summary').style.display = 'none';
        document.querySelector('.chart-section').style.display = 'none';
        document.getElementById('categoryDetailsSection').style.display = 'block';

        // Update title
        const titleEl = document.getElementById('categoryDetailsTitle');
        titleEl.innerHTML = `
            <div class="category-bar-icon" style="border-color: ${categoryColor}; background: ${categoryColor}20; display: inline-block; margin-right: 8px;">
                ${categoryIcon}
            </div>
            ${categoryName}
        `;

        // Fetch transactions for this category in current month
        const expenses = await API.getExpenses(state.currentMonth, state.currentYear);
        const categoryExpenses = expenses.filter(e => e.categoryId === categoryId);

        const listContainer = document.getElementById('categoryTransactionsList');
        listContainer.innerHTML = '';

        if (categoryExpenses.length === 0) {
            listContainer.innerHTML = UI.renderEmptyState('No transactions in this category', '📝');
            return;
        }

        categoryExpenses.forEach(expense => {
            listContainer.appendChild(UI.renderTransactionItem(expense, true));
        });
    } catch (error) {
        console.error('Error loading category transactions:', error);
        if (error.message === 'Authentication required') {
            handleAuthError(error);
        } else {
            UI.showToast('Failed to load transactions', 'error');
        }
    }
}

// ===================================
// INVESTMENTS VIEW
// ===================================

async function loadInvestmentsView() {
    try {
        const investments = await API.getInvestments();
        state.investments = investments;

        renderHoldingsList();
        
        // Hide results initially
        document.getElementById('portfolioResults').style.display = 'none';
    } catch (error) {
        console.error('Error loading investments view:', error);
        if (error.message === 'Authentication required') {
            handleAuthError(error);
        } else {
            UI.showToast('Failed to load investments', 'error');
        }
    }
}

function renderHoldingsList() {
    const listContainer = document.getElementById('stockHoldingsList');
    listContainer.innerHTML = '';

    if (state.investments.length === 0) {
        listContainer.innerHTML = UI.renderEmptyState('No stocks added yet', '📈');
        return;
    }

    state.investments.forEach(investment => {
        const holdingEl = document.createElement('div');
        holdingEl.className = 'holding-item';
        
        const badges = [];
        if (investment.manual_price_override) {
            badges.push('<span class="override-badge">Manual Price</span>');
        }
        if (investment.manual_rate_override) {
            badges.push('<span class="override-badge">Manual Rate</span>');
        }

        holdingEl.innerHTML = `
            <div class="holding-icon">${investment.ticker.charAt(0)}</div>
            <div class="holding-details">
                <div class="holding-ticker">${investment.ticker}</div>
                <div class="holding-shares">${investment.shares_owned} shares</div>
                ${badges.length > 0 ? `<div class="holding-badges">${badges.join('')}</div>` : ''}
            </div>
            <button class="btn-delete" data-ticker="${investment.ticker}">🗑️</button>
        `;

        // Add delete handler
        const deleteBtn = holdingEl.querySelector('.btn-delete');
        deleteBtn.addEventListener('click', async (e) => {
            e.stopPropagation();
            if (confirm(`Delete ${investment.ticker}?`)) {
                try {
                    await API.deleteInvestment(investment.ticker);
                    UI.showToast('Investment deleted', 'success');
                    await loadInvestmentsView();
                } catch (error) {
                    console.error('Error deleting investment:', error);
                    UI.showToast('Failed to delete investment', 'error');
                }
            }
        });

        // Add edit handler
        holdingEl.addEventListener('click', () => {
            openInvestmentModal(investment);
        });

        listContainer.appendChild(holdingEl);
    });
}

async function calculatePortfolio() {
    try {
        UI.showToast('Calculating...', 'info');
        const results = await API.calculateInvestments();
        state.investmentResults = results;

        renderCalculationResults(results);
        
        // Show results card
        document.getElementById('portfolioResults').style.display = 'block';
        
        UI.showToast('Portfolio calculated', 'success');
    } catch (error) {
        console.error('Error calculating portfolio:', error);
        if (error.message === 'Authentication required') {
            handleAuthError(error);
        } else {
            UI.showToast(error.message || 'Failed to calculate portfolio', 'error');
        }
    }
}

function renderCalculationResults(results) {
    document.getElementById('totalValueINR').textContent = UI.formatCurrency(results.totalINR);
    
    const exchangeRateDisplay = document.getElementById('exchangeRateDisplay');
    exchangeRateDisplay.textContent = results.exchangeRate ? 
        `$1 = ₹${results.exchangeRate.toFixed(2)}` : 'N/A';

    const timestamp = new Date(results.timestamp);
    document.getElementById('resultsTimestamp').textContent = 
        `Updated: ${timestamp.toLocaleString('en-IN', { 
            dateStyle: 'short', 
            timeStyle: 'short' 
        })}`;

    const breakdownContainer = document.getElementById('holdingsBreakdown');
    breakdownContainer.innerHTML = '';

    results.holdings.forEach(holding => {
        const holdingCard = document.createElement('div');
        holdingCard.className = 'holding-breakdown-item';

        if (holding.error) {
            holdingCard.innerHTML = `
                <div class="breakdown-header">
                    <span class="breakdown-ticker">${holding.ticker}</span>
                    <span class="breakdown-error">Error</span>
                </div>
                <div class="breakdown-error-msg">${holding.error}</div>
            `;
        } else {
            const badges = [];
            if (holding.manualPrice) badges.push('Manual Price');
            if (holding.manualRate) badges.push('Manual Rate');

            holdingCard.innerHTML = `
                <div class="breakdown-header">
                    <span class="breakdown-ticker">${holding.ticker}</span>
                    <span class="breakdown-value">${UI.formatCurrency(holding.valueINR)}</span>
                </div>
                <div class="breakdown-details">
                    ${holding.shares.toFixed(4)} shares × $${holding.priceUSD.toFixed(2)} = $${holding.valueUSD.toFixed(2)}
                    ${badges.length > 0 ? `<span class="breakdown-badges">(${badges.join(', ')})</span>` : ''}
                </div>
            `;
        }

        breakdownContainer.appendChild(holdingCard);
    });
}

function openInvestmentModal(investment = null) {
    const modal = document.getElementById('investmentModal');
    const form = document.getElementById('investmentForm');
    const title = modal.querySelector('.modal-title');
    const btn = document.getElementById('saveInvestmentBtn');

    modal.classList.add('active');

    if (investment) {
        // Edit mode
        title.textContent = 'Edit Stock';
        btn.textContent = 'Update Stock';
        state.currentInvestmentTicker = investment.ticker;

        form.elements.ticker.value = investment.ticker;
        form.elements.ticker.disabled = true; // Can't change ticker
        form.elements.shares_owned.value = investment.shares_owned;
        form.elements.manual_price_override.value = investment.manual_price_override || '';
        form.elements.manual_rate_override.value = investment.manual_rate_override || '';
    } else {
        // Add mode
        title.textContent = 'Add Stock';
        btn.textContent = 'Add Stock';
        state.currentInvestmentTicker = null;
        form.reset();
        form.elements.ticker.disabled = false;
    }
}

function closeInvestmentModal() {
    const modal = document.getElementById('investmentModal');
    const form = document.getElementById('investmentForm');
    modal.classList.remove('active');
    form.reset();
    form.elements.ticker.disabled = false;
    state.currentInvestmentTicker = null;
}

// ===================================
// FIXED DEPOSITS
// ===================================

async function loadFixedDeposits() {
    try {
        state.fixedDeposits = await API.getFixedDeposits();
        renderFDList();
    } catch (error) {
        console.error('Error loading FDs:', error);
        if (error.message === 'Authentication required') {
            handleAuthError(error);
        } else {
            UI.showToast('Failed to load fixed deposits', 'error');
        }
    }
}

function renderFDList() {
    const list = document.getElementById('fdList');
    list.innerHTML = '';
    
    if (state.fixedDeposits.length === 0) {
        list.innerHTML = UI.renderEmptyState('No fixed deposits yet', '🏦');
        document.getElementById('fdSummary').style.display = 'none';
        return;
    }

    let totalPrincipal = 0, totalCurrent = 0, totalMaturity = 0;
    
    state.fixedDeposits.forEach(fd => {
        totalPrincipal += fd.principal;
        totalCurrent += fd.currentValue;
        totalMaturity += fd.maturityValue;
        
        const maturityDate = new Date(fd.maturityDate);
        const isMatured = new Date() >= maturityDate;
        
        const item = document.createElement('div');
        item.className = 'holding-item fd-item';
        item.innerHTML = `
            <div class="holding-icon">🏦</div>
            <div class="holding-details">
                <div class="holding-ticker">${fd.bankName}</div>
                <div class="holding-shares">₹${fd.principal.toLocaleString('en-IN')} @ ${fd.rateOfInterest}%</div>
                <div class="fd-dates">
                    ${isMatured ? '<span class="matured-badge">Matured</span>' : `Matures: ${maturityDate.toLocaleDateString('en-IN')}`}
                </div>
                <div class="fd-current">Current: <span class="gold-text">₹${fd.currentValue.toLocaleString('en-IN', {maximumFractionDigits: 0})}</span></div>
            </div>
            <button class="btn-delete" data-id="${fd.id}">🗑️</button>
        `;
        
        item.querySelector('.btn-delete').addEventListener('click', async (e) => {
            e.stopPropagation();
            if (confirm('Delete this fixed deposit?')) {
                try {
                    await API.deleteFixedDeposit(fd.id);
                    UI.showToast('Fixed deposit deleted', 'success');
                    await loadFixedDeposits();
                } catch (error) {
                    console.error('Error deleting FD:', error);
                    UI.showToast('Failed to delete fixed deposit', 'error');
                }
            }
        });
        
        item.addEventListener('click', () => openFDModal(fd));
        list.appendChild(item);
    });
    
    document.getElementById('fdTotalPrincipal').textContent = UI.formatCurrency(totalPrincipal);
    document.getElementById('fdCurrentValue').textContent = UI.formatCurrency(totalCurrent);
    document.getElementById('fdMaturityValue').textContent = UI.formatCurrency(totalMaturity);
    document.getElementById('fdSummary').style.display = 'block';
}

function openFDModal(fd = null) {
    const modal = document.getElementById('fdModal');
    const form = document.getElementById('fdForm');
    const title = document.getElementById('fdModalTitle');
    const btn = document.getElementById('saveFDBtn');
    
    modal.classList.add('active');
    if (fd) {
        title.textContent = 'Edit Fixed Deposit';
        btn.textContent = 'Update';
        state.currentFDId = fd.id;
        form.elements.bankName.value = fd.bankName;
        form.elements.principal.value = fd.principal;
        form.elements.rateOfInterest.value = fd.rateOfInterest;
        form.elements.startDate.value = fd.startDate;
        form.elements.maturityDate.value = fd.maturityDate;
        form.elements.note.value = fd.note || '';
    } else {
        title.textContent = 'Add Fixed Deposit';
        btn.textContent = 'Add Fixed Deposit';
        state.currentFDId = null;
        form.reset();
    }
}

function closeFDModal() {
    document.getElementById('fdModal').classList.remove('active');
    document.getElementById('fdForm').reset();
    state.currentFDId = null;
}

async function handleSaveFD(event) {
    event.preventDefault();
    const form = event.target;
    const data = {
        bankName: form.elements.bankName.value,
        principal: parseFloat(form.elements.principal.value),
        rateOfInterest: parseFloat(form.elements.rateOfInterest.value),
        startDate: form.elements.startDate.value,
        maturityDate: form.elements.maturityDate.value,
        note: form.elements.note.value
    };
    
    try {
        if (state.currentFDId) {
            await API.updateFixedDeposit(state.currentFDId, data);
            UI.showToast('Fixed deposit updated!', 'success');
        } else {
            await API.createFixedDeposit(data);
            UI.showToast('Fixed deposit added!', 'success');
        }
        closeFDModal();
        await loadFixedDeposits();
    } catch (error) {
        console.error('Error saving FD:', error);
        if (error.message === 'Authentication required') {
            handleAuthError(error);
        } else {
            UI.showToast(error.message, 'error');
        }
    }
}

// ===================================
// PF (PROVIDENT FUND)
// ===================================

function generateFinancialYears() {
    const currentYear = new Date().getFullYear();
    const currentMonth = new Date().getMonth() + 1; // 1-12
    
    // Indian FY starts in April (month 4)
    const startYear = currentMonth >= 4 ? currentYear : currentYear - 1;
    
    const years = [];
    for (let i = 0; i < 10; i++) {
        const fy = `FY ${startYear - i}-${(startYear - i + 1).toString().slice(-2)}`;
        years.push(fy);
    }
    return years;
}

async function loadPFData() {
    try {
        const data = await API.getPFEntries(state.pfFilters);
        state.pfEntries = data.entries;
        state.pfSummary = data.summary;
        state.pfFinancialYears = data.financialYears;
        
        renderPFSummary();
        renderPFEntries();
        populatePFYearFilter();
    } catch (error) {
        console.error('Error loading PF data:', error);
        if (error.message === 'Authentication required') {
            handleAuthError(error);
        } else {
            UI.showToast('Failed to load PF data', 'error');
        }
    }
}

function renderPFSummary() {
    if (!state.pfSummary) return;
    
    document.getElementById('pfGrandTotal').textContent = UI.formatCurrency(state.pfSummary.grandTotal);
    document.getElementById('pfTotalDeposits').textContent = UI.formatCurrency(state.pfSummary.totalDeposits);
    document.getElementById('pfTotalInterest').textContent = UI.formatCurrency(state.pfSummary.totalInterest);
    
    document.getElementById('pfSummary').style.display = state.pfEntries.length > 0 ? 'block' : 'none';
}

function renderPFEntries() {
    const list = document.getElementById('pfEntriesList');
    list.innerHTML = '';
    
    if (state.pfEntries.length === 0) {
        list.innerHTML = UI.renderEmptyState('No PF entries yet', '🏦');
        return;
    }
    
    state.pfEntries.forEach(entry => {
        const entryDate = new Date(entry.date);
        const isDeposit = entry.type === 'deposit';
        
        const item = document.createElement('div');
        item.className = `pf-entry-item ${entry.type}`;
        item.innerHTML = `
            <div class="pf-entry-icon">${isDeposit ? '💰' : '📈'}</div>
            <div class="pf-entry-details">
                <div class="pf-entry-type">${isDeposit ? 'Deposit' : 'Interest'}</div>
                <div class="pf-entry-date">${entryDate.toLocaleDateString('en-IN')}</div>
                ${entry.financialYear ? `<div class="pf-entry-fy">${entry.financialYear}</div>` : ''}
                ${entry.note ? `<div class="pf-entry-note">${entry.note}</div>` : ''}
            </div>
            <div class="pf-entry-amount ${isDeposit ? 'deposit-amount' : 'interest-amount'}">
                ${UI.formatCurrency(entry.amount)}
            </div>
            <button class="btn-delete" data-id="${entry.id}">🗑️</button>
        `;
        
        item.querySelector('.btn-delete').addEventListener('click', async (e) => {
            e.stopPropagation();
            if (confirm(`Delete this ${entry.type} entry?`)) {
                try {
                    await API.deletePFEntry(entry.id);
                    UI.showToast('PF entry deleted', 'success');
                    await loadPFData();
                } catch (error) {
                    console.error('Error deleting PF entry:', error);
                    UI.showToast('Failed to delete entry', 'error');
                }
            }
        });
        
        list.appendChild(item);
    });
}

function populatePFYearFilter() {
    const filter = document.getElementById('pfYearFilter');
    const currentOptions = Array.from(filter.options).map(opt => opt.value);
    
    state.pfFinancialYears.forEach(year => {
        if (!currentOptions.includes(year)) {
            const option = document.createElement('option');
            option.value = year;
            option.textContent = year;
            filter.appendChild(option);
        }
    });
}

function openPFModal(type = 'deposit') {
    const modal = document.getElementById('pfModal');
    const form = document.getElementById('pfForm');
    const title = document.getElementById('pfModalTitle');
    const btn = document.getElementById('savePFBtn');
    const fyGroup = document.getElementById('pfFYGroup');
    const fySelect = document.getElementById('pfFinancialYear');
    
    // Set type
    document.getElementById('pfType').value = type;
    
    // Update UI based on type
    if (type === 'deposit') {
        title.textContent = 'Add PF Deposit';
        btn.textContent = 'Add Deposit';
        fyGroup.style.display = 'none';
        fySelect.removeAttribute('required');
    } else {
        title.textContent = 'Add Interest';
        btn.textContent = 'Add Interest';
        fyGroup.style.display = 'block';
        fySelect.setAttribute('required', 'required');
        
        // Populate FY dropdown
        fySelect.innerHTML = '<option value=\"\">Select Financial Year</option>';
        const years = generateFinancialYears();
        years.forEach(year => {
            const option = document.createElement('option');
            option.value = year;
            option.textContent = year;
            fySelect.appendChild(option);
        });
    }
    
    form.reset();
    document.getElementById('pfType').value = type;
    document.getElementById('pfDate').valueAsDate = new Date();
    modal.classList.add('active');
}

function closePFModal() {
    document.getElementById('pfModal').classList.remove('active');
    document.getElementById('pfForm').reset();
}

async function handleSavePF(event) {
    event.preventDefault();
    const form = event.target;
    const data = {
        type: form.elements.type.value,
        amount: parseFloat(form.elements.amount.value),
        date: form.elements.date.value,
        financialYear: form.elements.financialYear.value || null,
        note: form.elements.note.value
    };
    
    try {
        await API.createPFEntry(data);
        UI.showToast(`${data.type === 'deposit' ? 'Deposit' : 'Interest'} added!`, 'success');
        closePFModal();
        await loadPFData();
    } catch (error) {
        console.error('Error saving PF entry:', error);
        if (error.message === 'Authentication required') {
            handleAuthError(error);
        } else {
            UI.showToast(error.message, 'error');
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

async function handleSaveInvestment(event) {
    event.preventDefault();

    const formData = new FormData(event.target);
    const investmentData = {
        ticker: formData.get('ticker').toUpperCase(),
        shares_owned: parseFloat(formData.get('shares_owned')),
        manual_price_override: formData.get('manual_price_override') ? parseFloat(formData.get('manual_price_override')) : null,
        manual_rate_override: formData.get('manual_rate_override') ? parseFloat(formData.get('manual_rate_override')) : null
    };

    try {
        await API.createInvestment(investmentData);
        UI.showToast(state.currentInvestmentTicker ? 'Stock updated!' : 'Stock added!', 'success');

        closeInvestmentModal();
        await loadInvestmentsView();
    } catch (error) {
        console.error('Error saving investment:', error);
        if (error.message === 'Authentication required') {
            handleAuthError(error);
        } else {
            UI.showToast(error.message || 'Failed to save investment', 'error');
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

// ===================================
// PIN AND PRIVILEGED MODE HANDLERS
// ===================================
async function handleInvestmentsAccess() {
    try {
        // Check if user has PIN set
        const response = await API.hasPin();
        state.hasPin = response.hasPin;

        if (!state.hasPin) {
            // Show PIN setup modal for first time
            showPinSetupModal();
        } else {
            // Show PIN entry modal
            showPinModal();
        }
    } catch (error) {
        console.error('Error checking PIN status:', error);
        if (error.message === 'Authentication required') {
            handleAuthError(error);
        } else {
            UI.showToast('Failed to check PIN status', 'error');
        }
    }
}

function showPinSetupModal() {
    const modal = document.getElementById('pinSetupModal');
    const form = document.getElementById('pinSetupForm');
    form.reset();
    modal.classList.add('active');
}

function closePinSetupModal() {
    const modal = document.getElementById('pinSetupModal');
    modal.classList.remove('active');
}

function showPinModal() {
    const modal = document.getElementById('pinModal');
    const form = document.getElementById('pinForm');
    form.reset();
    modal.classList.add('active');
}

function closePinModal() {
    const modal = document.getElementById('pinModal');
    modal.classList.remove('active');
}

async function handlePinSetup(event) {
    event.preventDefault();

    const formData = new FormData(event.target);
    const pin = formData.get('pin') || document.getElementById('setupPin').value;
    const pinConfirm = formData.get('pinConfirm') || document.getElementById('setupPinConfirm').value;
    const password = formData.get('password') || document.getElementById('setupPassword').value;

    if (pin !== pinConfirm) {
        UI.showToast('PINs do not match', 'error');
        return;
    }

    if (!/^\d{4,6}$/.test(pin)) {
        UI.showToast('PIN must be 4-6 digits', 'error');
        return;
    }

    try {
        await API.setPin(password, pin);
        state.hasPin = true;
        state.privilegedMode = true;
        sessionStorage.setItem('privilegedMode', 'true');
        
        closePinSetupModal();
        UI.showToast('PIN set successfully!', 'success');
        UI.switchView('investments');
    } catch (error) {
        console.error('Error setting PIN:', error);
        UI.showToast(error.message || 'Failed to set PIN', 'error');
    }
}

async function handlePinEntry(event) {
    event.preventDefault();

    const formData = new FormData(event.target);
    const pin = formData.get('pin') || document.getElementById('pinInput').value;

    if (!/^\d{4,6}$/.test(pin)) {
        UI.showToast('PIN must be 4-6 digits', 'error');
        return;
    }

    try {
        const response = await API.verifyPin(pin);
        
        if (response.valid) {
            state.privilegedMode = true;
            sessionStorage.setItem('privilegedMode', 'true');
            
            closePinModal();
            UI.showToast('Access granted', 'success');
            UI.switchView('investments');
        } else {
            UI.showToast('Invalid PIN', 'error');
            document.getElementById('pinInput').value = '';
        }
    } catch (error) {
        console.error('Error verifying PIN:', error);
        UI.showToast(error.message || 'Failed to verify PIN', 'error');
    }
}

// ===================================
// SETTINGS VIEW
// ===================================
async function loadSettingsView() {
    if (!state.currentUser) return;

    // Update profile info
    document.getElementById('settingsUsername').textContent = state.currentUser.username;
    
    const memberSince = new Date(state.currentUser.createdAt).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });
    document.getElementById('settingsMemberSince').textContent = memberSince;

    // Update PIN status info
    try {
        const response = await API.hasPin();
        const pinInfo = document.getElementById('pinStatusInfo');
        if (response.hasPin) {
            pinInfo.textContent = 'Update your PIN to change your investments protection.';
        } else {
            pinInfo.textContent = 'Set a 4-6 digit PIN to protect your investments section.';
        }
    } catch (error) {
        console.error('Error loading PIN status:', error);
    }

    // Reset form
    document.getElementById('changePinForm').reset();
}

async function handleChangePinFunction(event) {
    event.preventDefault();

    const formData = new FormData(event.target);
    const password = formData.get('password') || document.getElementById('currentPassword').value;
    const newPin = formData.get('newPin') || document.getElementById('newPin').value;
    const confirmPin = formData.get('confirmPin') || document.getElementById('confirmPin').value;

    if (newPin !== confirmPin) {
        UI.showToast('PINs do not match', 'error');
        return;
    }

    if (!/^\d{4,6}$/.test(newPin)) {
        UI.showToast('PIN must be 4-6 digits', 'error');
        return;
    }

    try {
        await API.setPin(password, newPin);
        state.hasPin = true;
        
        UI.showToast('PIN updated successfully!', 'success');
        event.target.reset();
    } catch (error) {
        console.error('Error updating PIN:', error);
        UI.showToast(error.message || 'Failed to update PIN', 'error');
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
        btn.addEventListener('click', (e) => {
            const view = btn.dataset.view;
            
            // Special handling for investments - check PIN first
            if (view === 'investments' && !state.privilegedMode) {
                e.preventDefault();
                e.stopPropagation();
                handleInvestmentsAccess();
                return;
            }
            
            UI.switchView(view);
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
    document.getElementById('logoutBtn') && document.getElementById('logoutBtn').addEventListener('click', handleLogout);
    document.getElementById('logoutBtnSettings').addEventListener('click', handleLogout);
    document.getElementById('exportBtn').addEventListener('click', exportExpensesToCSV);

    // Settings button
    const settingsBtn = document.getElementById('settingsBtn');
    if (settingsBtn) {
        settingsBtn.addEventListener('click', () => {
            UI.switchView('settings');
        });
    }

    // Back to analytics button
    const backToAnalyticsBtn = document.getElementById('backToAnalytics');
    if (backToAnalyticsBtn) {
        backToAnalyticsBtn.addEventListener('click', () => {
            loadAnalyticsView();
        });
    }

    // PIN modals
    document.getElementById('closePinSetupModal').addEventListener('click', closePinSetupModal);
    document.querySelector('#pinSetupModal .modal-backdrop').addEventListener('click', closePinSetupModal);
    document.getElementById('pinSetupForm').addEventListener('submit', handlePinSetup);

    document.getElementById('closePinModal').addEventListener('click', closePinModal);
    document.querySelector('#pinModal .modal-backdrop').addEventListener('click', closePinModal);
    document.getElementById('pinForm').addEventListener('submit', handlePinEntry);

    // Settings form
    document.getElementById('changePinForm').addEventListener('submit', handleChangePinFunction);

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

    // Investment tabs
    document.querySelectorAll('.investment-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            const type = tab.dataset.investmentType;
            state.investmentType = type;

            // Update active tab
            document.querySelectorAll('.investment-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');

            // Show/hide content
            document.querySelectorAll('.investment-tab-content').forEach(content => {
                content.classList.remove('active');
            });
            document.getElementById(`${type}-content`).classList.add('active');
            
            // Load FDs when switching to mutual-funds (FD) tab
            if (type === 'mutual-funds') {
                loadFixedDeposits();
            }
            
            // Load PF when switching to PF tab
            if (type === 'pf') {
                loadPFData();
            }
        });
    });

    // Investment buttons
    document.getElementById('addStockBtn').addEventListener('click', () => openInvestmentModal());
    document.getElementById('calculatePortfolioBtn').addEventListener('click', calculatePortfolio);

    // Investment modal
    document.getElementById('closeInvestmentModal').addEventListener('click', closeInvestmentModal);
    document.querySelector('#investmentModal .modal-backdrop').addEventListener('click', closeInvestmentModal);
    document.getElementById('investmentForm').addEventListener('submit', handleSaveInvestment);

    // Fixed Deposit events
    document.getElementById('addFDBtn').addEventListener('click', () => openFDModal());
    document.getElementById('closeFDModal').addEventListener('click', closeFDModal);
    document.querySelector('#fdModal .modal-backdrop').addEventListener('click', closeFDModal);
    document.getElementById('fdForm').addEventListener('submit', handleSaveFD);

    // PF events
    document.getElementById('addPFDepositBtn').addEventListener('click', () => openPFModal('deposit'));
    document.getElementById('addPFInterestBtn').addEventListener('click', () => openPFModal('interest'));
    document.getElementById('closePFModal').addEventListener('click', closePFModal);
    document.querySelector('#pfModal .modal-backdrop').addEventListener('click', closePFModal);
    document.getElementById('pfForm').addEventListener('submit', handleSavePF);
    
    // PF filters
    document.getElementById('pfTypeFilter').addEventListener('change', (e) => {
        state.pfFilters.type = e.target.value;
        loadPFData();
    });
    document.getElementById('pfYearFilter').addEventListener('change', (e) => {
        state.pfFilters.financialYear = e.target.value;
        loadPFData();
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
        const settingsBtn = document.getElementById('settingsBtn');
        const usernameGreeting = document.getElementById('usernameGreeting');

        // Validate user data before proceeding
        if (!validateUserData(state.currentUser)) {
            throw new Error('Invalid user data');
        }

        // Hide old logout button (now in settings)
        if (logoutBtn) logoutBtn.style.display = 'none';

        // Show settings button
        if (settingsBtn) settingsBtn.style.display = 'block';

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
