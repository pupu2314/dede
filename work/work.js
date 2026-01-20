:root {
	--primary-color: #007bff;
	--secondary-color: #6c757d;
	--bg-color: #f8f9fa;
	--text-color: #333;
	--border-color: #dee2e6;
	--success-color: #28a745;
	--danger-color: #dc3545;
	--warning-color: #ffc107;
	--white-color: #fff;
	--font-family: 'Segoe UI', 'Microsoft JhengHei', sans-serif;
}
body {
	font-family: var(--font-family);
	background-color: var(--bg-color);
	color: var(--text-color);
	margin: 0;
	padding: 1rem;
	line-height: 1.6;
}
.container {
	max-width: 1000px;
	margin: auto;
	background: var(--white-color);
	padding: 1.5rem;
	border-radius: 8px;
	box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}
h1.app-title {
	color: var(--primary-color);
	border-bottom: none;
    text-align: center;
	margin-top: 0;
    margin-bottom: 1rem;
}
h1 small {
    font-size: 0.5em; 
    color: #666;
}
h2 {
	color: var(--primary-color);
	border-bottom: 2px solid var(--border-color);
	padding-bottom: 0.5rem;
	margin-top: 0;
}

/* Toast Notification */
.toast {
    visibility: hidden;
    min-width: 250px;
    margin-left: -125px;
    background-color: #333;
    color: #fff;
    text-align: center;
    border-radius: 4px;
    padding: 16px;
    position: fixed;
    z-index: 1001; /* Above modal */
    left: 50%;
    bottom: 30px;
    font-size: 17px;
    box-shadow: 0 4px 8px rgba(0,0,0,0.3);
    opacity: 0;
    transition: opacity 0.3s, bottom 0.3s;
}

.toast.show {
    visibility: visible;
    opacity: 1;
    bottom: 50px;
}
.toast.success { background-color: var(--success-color); }
.toast.error { background-color: var(--danger-color); }
.toast.info { background-color: #17a2b8; }

/* Sync Alert Bar */
.sync-alert-bar {
    background-color: #fff3cd;
    color: #856404;
    border: 1px solid #ffeaa7;
    padding: 0.75rem 1rem;
    border-radius: 6px;
    margin-bottom: 1rem;
    display: flex;
    align-items: center;
    justify-content: space-between;
    animation: slideDown 0.3s ease-out;
}
@keyframes slideDown {
    from { opacity: 0; transform: translateY(-10px); }
    to { opacity: 1; transform: translateY(0); }
}

/* Tabs Navigation Styles */
.tabs-nav {
    display: flex;
    justify-content: space-around;
    background: #e9ecef;
    border-radius: 8px;
    padding: 0.5rem;
    margin-bottom: 1.5rem;
    gap: 0.5rem;
}
.tab-btn {
    flex: 1;
    background: transparent;
    border: none;
    padding: 0.75rem;
    color: var(--text-color);
    font-weight: bold;
    cursor: pointer;
    border-radius: 6px;
    transition: all 0.3s ease;
}
.tab-btn:hover {
    background: rgba(0,0,0,0.05);
}
.tab-btn.active {
    background: var(--primary-color);
    color: white;
    box-shadow: 0 2px 4px rgba(0,0,0,0.2);
}
/* Tab Content */
.tab-content {
    display: none; /* Default hidden */
    animation: fadeIn 0.3s ease-in-out;
}
.tab-content.active {
    display: block;
}
@keyframes fadeIn {
    from { opacity: 0; transform: translateY(5px); }
    to { opacity: 1; transform: translateY(0); }
}

/* Leave Stats */
.leave-stats-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 1rem;
    margin-bottom: 1.5rem;
}
.leave-stat-box {
    background: #f8f9fa;
    padding: 1rem;
    border-radius: 8px;
    text-align: center;
    border: 1px solid #dee2e6;
}
.leave-stat-box h4 {
    margin: 0 0 0.5rem 0;
    font-size: 0.9rem;
    color: #666;
}
.leave-stat-box .stat-value {
    font-size: 1.8rem;
    font-weight: bold;
    color: #333;
}
.leave-stat-box .stat-value small {
    font-size: 0.9rem;
    color: #888;
}
.leave-stat-box .stat-desc {
    font-size: 0.8rem;
    color: #999;
    margin-top: 0.25rem;
}
.leave-stat-box.remaining {
    background: #e9f5ff;
    border-color: #b3d7ff;
}
.leave-stat-box .stat-value.highlight {
    color: var(--primary-color);
}

summary {
	font-size: 1.5rem;
	font-weight: bold;
	cursor: pointer;
}
details>div {
	margin-top: 1rem;
}
.grid-container {
	display: grid;
	grid-template-columns: 1fr;
	gap: 2rem;
}
@media (min-width: 768px) {
	.grid-container {
		grid-template-columns: repeat(2, 1fr);
	}
}
@media (min-width: 768px) {
	.grid-container.single-column-grid {
		grid-template-columns: 1fr;
	}
}
.card {
	background: #fff;
    padding: 0; /* Reset for tab content flow */
	border: none; /* Remove border inside tab */
}
/* Specific Card overrides for legacy structure support inside tabs */
.tab-content .card {
    border: none;
    padding: 0;
}

.form-group {
	margin-bottom: 1rem;
}
.time-input-group {
	display: grid;
	grid-template-columns: repeat(2, 1fr);
	gap: 0.5rem;
	align-items: center;
}
label {
	display: block;
	margin-bottom: 0.5rem;
	font-weight: bold;
}
input[type="number"], input[type="datetime-local"], input[type="text"], input[type="time"], textarea, input[type="month"], input[type="date"] {
	width: 100%;
	padding: 0.75rem;
	border: 1px solid var(--border-color);
	border-radius: 4px;
	box-sizing: border-box;
	font-size: 1rem;
}
.radio-group label, .checkbox-group label {
	display: inline-flex;
	align-items: center;
	margin-right: 1rem;
	font-weight: normal;
	cursor: pointer;
}
.checkbox-group input {
	margin-right: 0.5rem;
}
button {
	background-color: var(--primary-color);
	color: var(--white-color);
	border: none;
	padding: 0.75rem 1.5rem;
	border-radius: 4px;
	cursor: pointer;
	font-size: 1rem;
	transition: background-color 0.3s;
}
button:hover {
	background-color: #0056b3;
}
button:disabled {
	background-color: #ccc;
	cursor: not-allowed;
}
.btn-secondary {
	background-color: var(--secondary-color);
}
.btn-secondary:hover {
	background-color: #545b62;
}
.btn-danger {
	background-color: var(--danger-color);
}
.btn-danger:hover {
	background-color: #c82333;
}
.btn-warning {
    background-color: var(--warning-color);
    color: #212529;
}
.btn-warning:hover {
    background-color: #e0a800;
}
.btn-small {
	padding: 0.4rem 0.8rem;
	font-size: 0.9rem;
}

/* Sync Buttons */
.btn-sync {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
}
.btn-sync.upload {
    background-color: #28a745;
}
.btn-sync.upload:hover {
    background-color: #218838;
}
.btn-sync.download {
    background-color: #17a2b8;
}
.btn-sync.download:hover {
    background-color: #138496;
}
.sync-status-msg {
    margin-top: 10px;
    padding: 10px;
    background: #fff;
    border-radius: 4px;
    border: 1px solid #ddd;
    font-size: 0.9rem;
}

table {
	width: 100%;
	border-collapse: collapse;
	margin-top: 1rem;
}
th, td {
	border-bottom: 1px solid var(--border-color);
	padding: 0.75rem;
	text-align: left;
	word-break: break-word;
}
th {
	background-color: #f2f2f2;
}
.summary {
	background: #e9f5ff;
	border: 1px solid #b3d7ff;
	padding: 1.5rem;
	margin-top: 1rem;
	border-radius: 8px;
}
.summary-value {
	font-size: 1.5rem;
	font-weight: bold;
	color: var(--success-color);
}
.error-message {
	margin-top: 0.5rem;
	font-weight: bold;
	padding: 0.75rem;
	border-radius: 4px;
	color: var(--danger-color);
	background-color: #f8d7da;
	border: 1px solid #f5c6cb;
	white-space: pre-line;
}
.info-message {
	margin-top: 0.5rem;
	font-weight: bold;
	padding: 0.75rem;
	border-radius: 4px;
	color: #0c5460;
	background-color: #d1ecf1;
	border: 1px solid #bee5eb;
}
.warning-message {
	margin-top: 0.5rem;
	font-weight: bold;
	padding: 0.75rem;
	border-radius: 4px;
	color: #856404;
	background-color: #fff3cd;
	border: 1px solid #ffeaa7;
}
#punch-status {
	font-size: 1.1rem;
	line-height: 1.8;
}
.mode-switcher {
	display: flex;
	gap: 0.5rem;
	margin-bottom: 1rem;
	border-bottom: 1px solid var(--border-color);
	padding-bottom: 1rem;
}
.mode-switcher button {
	flex: 1;
}
.mode-switcher button.active {
	background-color: #0056b3;
	font-weight: bold;
}
.daily-group-header {
	background-color: #f2f2f2;
	font-weight: bold;
}
.record-detail-row td, .formula-detail-row td {
	padding-left: 2rem;
	font-size: 0.9rem;
	color: #555;
	border-top: 1px dotted #ccc;
}
.formula-detail-row td {
	background-color: #f9f9f9;
	padding: 1rem;
	font-family: monospace;
	color: #0056b3;
}
.actions-container {
	display: flex;
	justify-content: flex-end;
	align-items: center;
	gap: 0.5rem;
	min-width: 140px;
}
#export-container {
	position: absolute;
	left: -9999px;
	top: auto;
	width: 1000px;
	background: white;
	padding: 2rem;
	box-sizing: border-box;
	font-family: var(--font-family);
	color: var(--text-color);
}
#export-container h2, #export-container h3 {
	color: var(--primary-color);
	border-bottom: 2px solid var(--border-color);
	padding-bottom: 0.5rem;
	margin-top: 0;
}
#export-container table {
	width: 100%;
	border-collapse: collapse;
}
#export-container th, #export-container td {
	border: 1px solid var(--border-color);
	padding: 0.75rem;
	text-align: left;
}
#export-container th {
	background-color: #f2f2f2;
}
#export-container .summary {
	margin-top: 2rem;
	text-align: right;
	background: #e9f5ff;
	border: 1px solid #b3d7ff;
	padding: 1.5rem;
	border-radius: 8px;
}
#export-container .summary-value {
	font-size: 1.8rem;
	color: var(--success-color);
}
#export-container thead {
	display: table-header-group !important;
}
#export-container tr {
	display: table-row !important;
}
#export-container td {
	display: table-cell !important;
}
#export-container td::before {
	content: none !important;
}
.modal {
	display: none;
	position: fixed;
	z-index: 1000;
	left: 0;
	top: 0;
	width: 100%;
	height: 100%;
	background-color: rgba(0,0,0,0.5);
}
.modal.show {
	display: flex;
	align-items: center;
	justify-content: center;
}
.modal-content {
	background-color: white;
	padding: 2rem;
	border-radius: 8px;
	max-width: 500px;
	width: 90%;
	box-shadow: 0 4px 20px rgba(0,0,0,0.3);
}
.modal-buttons {
	display: flex;
	gap: 1rem;
	margin-top: 1.5rem;
	justify-content: flex-end;
}
@media (max-width: 768px) {
	thead {
		display: none;
	}
	tr:not(.formula-detail-row) {
		display: block;
		border: 1px solid var(--border-color);
		border-radius: 8px;
		margin-bottom: 1rem;
		padding: 1rem;
		box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
	}
	tr.daily-group-header {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.5rem;
		padding: 0.5rem;
		margin-bottom: 0.5rem;
		background-color: #e9f5ff;
	}
	td {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 0.5rem 0;
		border-bottom: 1px dotted var(--border-color);
		text-align: right;
	}
	td:last-child {
		border-bottom: none;
	}
	td::before {
		content: attr(data-label);
		font-weight: bold;
		text-align: left;
		margin-right: 1rem;
	}
	.formula-detail-row {
		display: block;
	}
	.formula-detail-row td {
		display: block;
		text-align: left;
	}
    /* Mobile Leave Stats */
    .leave-stats-grid {
        grid-template-columns: 1fr;
        gap: 0.5rem;
    }
}
