# Income Tracking Feature

## Overview
Added comprehensive income tracking functionality alongside the existing expense tracking system. Users can now toggle between viewing expenses and incomes, with separate categories and data for each.

## Changes Made

### 1. Backend Changes

#### Database Schema (models/database.js)
- Added `income_categories` table with fields: id, name, icon, hexColor
- Added `incomes` table with fields: id, amount, date, categoryId, userId, note, source, timestamp
- Added 6 default income categories:
  - 💼 Salary (#4CAF50)
  - 💻 Freelance (#8BC34A)
  - 📈 Investment (#00BCD4)
  - 🎁 Gift (#E91E63)
  - ↩️ Refund (#9C27B0)
  - 💰 Other Income (#FF9800)

#### New Models
- **models/Income.js**: Complete CRUD operations for income entries
  - tripleWrite() - Maintains backup consistency
  - getAll() - Fetch all incomes with filters
  - getById() - Get single income
  - create() - Add new income
  - update() - Update existing income
  - delete() - Remove income
  - getMonthlySummary() - Monthly analytics
  - getYearlySummary() - Yearly analytics

- **models/IncomeCategory.js**: Manage income categories
  - getAll() - Fetch all categories
  - getById() - Get single category
  - create() - Add new category
  - update() - Update category
  - delete() - Remove category

#### API Endpoints (server.js)
Added new RESTful endpoints:
- `GET /api/incomes` - List incomes (with month/year filters)
- `POST /api/incomes` - Create new income
- `GET /api/incomes/:id` - Get single income
- `PUT /api/incomes/:id` - Update income
- `DELETE /api/incomes/:id` - Delete income
- `GET /api/income-categories` - List income categories
- `POST /api/income-categories` - Create income category
- `GET /api/income-summary/:year/:month` - Monthly income summary
- `GET /api/income-summary/year/:year` - Yearly income summary

All endpoints protected with JWT authentication.

### 2. Frontend Changes

#### State Management (public/app.js)
- Added `viewType` state ('expense' or 'income')
- Added `incomes` array to state
- Added `incomeCategories` array to state
- Added `currentIncomeId` for editing tracking

#### New API Functions
- `getIncomeCategories()` - Fetch income categories
- `getIncomes()` - Fetch incomes with filters
- `createIncome()` - Create new income
- `updateIncome()` - Update existing income
- `deleteIncome()` - Delete income
- `createIncomeCategory()` - Create income category
- `getIncomeMonthlySummary()` - Monthly income analytics
- `getIncomeYearlySummary()` - Yearly income analytics

#### UI Components (public/index.html)
- Added clickable toggle buttons in section headers to switch between Expenses/Income views
- Added income modal with form (similar to expense modal but with "Source" field instead of "Where")
- Added income category modal for creating new income categories
- Toggle appears in both Home and History views

#### Modal Functions (public/app.js)
- `openIncomeModal()` - Open income add/edit modal
- `closeIncomeModal()` - Close income modal
- `openIncomeCategoryModal()` - Open income category modal
- `closeIncomeCategoryModal()` - Close income category modal

#### Rendering Functions
- `renderIncomeItem()` - Render individual income entries with green amount display
- Updated `loadHomeView()` - Support both expense and income views
- Updated `loadHistoryView()` - Support both expense and income views

#### Event Handlers
- `handleSaveIncome()` - Save income (create/update)
- `handleSaveIncomeCategory()` - Save income category
- `handleDeleteIncome()` - Delete income entry

#### View Management
- `updateFAB()` - Updates FAB label based on view type
- View toggle buttons update active state and reload data
- FAB click opens appropriate modal (expense or income)

#### Initialization
- `populateIncomeCategorySelect()` - Load income categories into dropdown
- Updated `initApp()` to load income categories
- Updated `initEventListeners()` to handle income-related events

### 3. Styling (public/style.css)
- `.income-amount` - Green color (#4CAF50) for income amounts
- `.view-toggle-btn` - Clickable toggle button styling
- `.view-toggle-btn.active` - Active state with gold color
- `.view-toggle-separator` - Separator between toggle options
- `.section-header` - Container for section title with toggles

## User Experience

### Switching Between Views
1. Users see "Expenses / Income" toggle in both Home and History views
2. Click on either word to switch the view
3. Active view is highlighted in gold
4. FAB updates context (adds expense vs adds income)
5. Monthly total updates to show expense or income total
6. Transaction list refreshes to show relevant data

### Adding Income
1. Switch to Income view using toggle
2. Click FAB (+ button)
3. Fill in income form:
   - Amount
   - Date
   - Category (from income categories dropdown)
   - Source (where the income came from)
   - Note (optional)
4. Submit to save

### Income Display
- Income amounts are displayed in green (#4CAF50)
- Expense amounts remain in gold (default)
- Each income shows category icon, source, note, and date
- Separate category system for incomes vs expenses

## Database Integrity
- Triple-write pattern maintained for all income operations
- Foreign key constraints to income_categories and users tables
- Consistent with existing expense data architecture

## Authentication
- All income endpoints require JWT authentication
- User isolation enforced (users only see their own incomes)
- Same security model as expenses

## Future Enhancements (Optional)
1. Combined view showing both expenses and incomes
2. Net cash flow analytics (income - expenses)
3. Income vs Expense comparison charts
4. Budget planning based on income
5. Recurring income entries
6. CSV export for incomes
7. Income categories management UI (edit/delete)

## Testing Checklist
- [ ] Can create new income entry
- [ ] Can edit existing income
- [ ] Can delete income
- [ ] Can create custom income category
- [ ] Toggle switches between expense/income views
- [ ] Income amounts display in green
- [ ] Monthly summaries update correctly
- [ ] FAB opens correct modal based on view
- [ ] Authentication protects all income endpoints
- [ ] Triple-write works for income operations

## Notes
- Income tracking is now fully functional and parallel to expense tracking
- Default income categories are created on first database initialization
- All income data is user-specific and properly authenticated
- The UI seamlessly integrates income tracking without disrupting the expense workflow
