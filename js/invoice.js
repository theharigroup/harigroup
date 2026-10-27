// Invoice manager module. Loaded only on invoice.html.
// --- SUPABASE INITIALIZATION ---
                const SUPABASE_URL = 'https://kknmrxopxnhirntmnwhb.supabase.co';
                const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imtrbm1yeG9weG5oaXJudG1ud2hiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODgyNzIzNTMsImV4cCI6MjEwMzg0ODM1M30.XU-WKnn--on-UKwaSWAVMNG3mZCCO4QOenobrEXKf2s';
                
                const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

                const USERS = [
                    { id: 'usr-1', username: 'bibhasbiswal@iisc.ac.in', password: 'sfej$875646HH', name: 'Bibhas Ranjan', role: 'Solvent Manager', title: 'Lab Consumable Receiver', avatar: 'BR', color: 'bg-blue-600 rounded-full' },
                    { id: 'usr-2', username: 'anupamdutta@iisc.ac.in', password: 'anufej$8756', name: 'Anupam Dutta', role: 'Chemical Manager', title: 'Lab Consumable Receiver', avatar: 'AD', color: 'bg-blue-600 rounded-full' },
                    { id: 'usr-3', username: 'rwishanyadas@iisc.ac.in', password: 'rwishi$8756', name: 'Rwishanya Das', role: 'Chemical Manager', title: 'Lab Consumable Receiver', avatar: 'RD', color: 'bg-blue-600 rounded-full' },
                    { id: 'usr-4', username: 'athmananda@iisc.ac.in', password: 'athma0*(%$8756', name: 'Athmanand Anchi', role: 'Glassware Manager', title: 'Lab Consumable Receiver', avatar: 'AA', color: 'bg-blue-600 rounded-full' },
                    { id: 'usr-5', username: 'binadas@iisc.ac.in', password: 'sjfh%&%$^FVHGHG', name: 'Bina Das', role: 'Lab Accountant', title: 'Financial Manager', avatar: 'BD', color: 'bg-blue-600 rounded-full' },
                    { id: 'usr-6', username: 'oc.office@iisc.ac.in', password: 'ashjdgj%^%$%&^TGH', name: 'Office Staff', role: 'Office Staff', title: 'University Finance Admin', avatar: 'OC', color: 'bg-blue-600 rounded-full' },
                    { id: 'usr-7', username: 'tushraas@iisc.ac.in', password: '4051310074&Tus', name: 'Tushar Singha', role: 'Administrator', title: 'Administrator', avatar: 'TS', color: 'bg-blue-600 rounded-full' }
                ];

                const MOCK_VENDORS = [
                    'Chempure Pvt Ltd',
                    'Jinay Pharmaceuticals Private Limited',
                    'Jitech Equipments Solutions',
                    'Primal Scientific',
                    'Bionova Supplies',
                    'CAPITAL SCIENTIFIC INDIA PVT LTD',
                    'Sarvesh Chemical Industries',
                    'Corning Life Sciences'
                ];

                let currentUser = null;
                let invoices = [];
                let vendors = [...MOCK_VENDORS];
                let activeView = 'board';
                let searchQuery = '';
                let selectedStatus = 'ALL';
                let selectedInvoice = null;
                let formItems = [{ name: '', quantity: 1, unitPrice: 0 }];

                function isConsumableManager(role) {
                    return ['Solvent Manager', 'Chemical Manager', 'Glassware Manager', 'Lab Receiver'].includes(role);
                }

                function isInvoiceCreator(inv, user) {
                    if (!user || !inv || !inv.created || !inv.created.by) return false;
                    return inv.created.by.includes(user.name);
                }

                function formatDate(ts) {
                    if (!ts) return null;
                    const d = new Date(ts);
                    return `${d.toISOString().split('T')[0]} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
                }

                window.addEventListener('DOMContentLoaded', async () => {
                    if (typeof lucide !== 'undefined') lucide.createIcons();

                    const savedUserStr = localStorage.getItem('LAB_ACTIVE_USER');
                    if (savedUserStr) {
                        try {
                            const u = JSON.parse(savedUserStr);
                            const found = USERS.find(usr => usr.username === u.username);
                            if (found) {
                                currentUser = found;
                                updateUserUi();
                            }
                        } catch(e) {}
                    }

                    await fetchInvoicesFromSupabase();
                });

                // --- SUPABASE DATA FETCHING ---
                async function fetchInvoicesFromSupabase() {
                    try {
                        const { data: dbInvoices, error } = await supabaseClient
                            .from('invoices')
                            .select('*, invoice_items(*)');

                        if (error) throw error;

                        if (dbInvoices && dbInvoices.length > 0) {
                            invoices = dbInvoices.map(row => ({
                                id: row.id,
                                vendor: row.vendor,
                                invoiceNumber: row.invoice_number,
                                invoiceDate: row.invoice_date,
                                grantCode: row.grant_code || 'UNASSIGNED',
                                totalPrice: parseFloat(row.total_price) || 0,
                                status: row.status,
                                created: { by: row.created_by || 'System User', timestamp: formatDate(row.created_at) },
                                accountantReceived: row.accountant_received_by ? { by: row.accountant_received_by, timestamp: formatDate(row.accountant_received_at) } : null,
                                officeReceived: row.office_received_by ? { by: row.office_received_by, timestamp: formatDate(row.office_received_at) } : null,
                                completed: row.completed_by ? { by: row.completed_by, timestamp: formatDate(row.completed_at), poNumber: row.po_number } : null,
                                notes: row.notes,
                                rejectionReason: row.rejection_reason,
                                comments: row.comments || [],
                                items: (row.invoice_items || []).map(item => ({
                                    name: item.item_name,
                                    quantity: item.quantity,
                                    unitPrice: parseFloat(item.unit_price)
                                }))
                            }));
                        } else {
                            invoices = [];
                        }
                    } catch (err) {
                        console.error('Error fetching invoices from Supabase:', err);
                        showToast('Error syncing with Supabase.');
                    }
                    renderApp();
                }

                // --- AUTHENTICATION ---
                function handleLoginSubmit(e) {
                    e.preventDefault();
                    const uInput = document.getElementById('login-username').value.trim();
                    const pInput = document.getElementById('login-password').value.trim();

                    const matchedUser = USERS.find(u => u.username === uInput && u.password === pInput);

                    if (matchedUser) {
                        currentUser = matchedUser;
                        localStorage.setItem('LAB_ACTIVE_USER', JSON.stringify({ username: matchedUser.username }));
                        document.getElementById('login-error').classList.add('hidden');
                        updateUserUi();
                        renderApp();
                        showToast(`Logged in as ${currentUser.name} (${currentUser.role})`);
                    } else {
                        document.getElementById('login-error-text').innerText = 'Invalid username or password credentials.';
                        document.getElementById('login-error').classList.remove('hidden');
                    }
                }

                function handleLogout() {
                    currentUser = null;
                    localStorage.removeItem('LAB_ACTIVE_USER');
                    if (document.getElementById('login-username')) document.getElementById('login-username').value = '';
                    if (document.getElementById('login-password')) document.getElementById('login-password').value = '';
                    if (document.getElementById('login-error')) document.getElementById('login-error').classList.add('hidden');
                    renderApp();
                    showToast('Logged out of session');
                }

                function updateUserUi() {
                    if (!currentUser) return;
                    document.getElementById('user-name').innerText = currentUser.name;
                    document.getElementById('user-role').innerText = currentUser.role;
                    document.getElementById('user-avatar').innerText = currentUser.avatar;
                    document.getElementById('user-avatar').className = `w-8 h-8 ${currentUser.color} rounded-full flex items-center justify-center font-bold text-xs text-white`;
                }

                // --- TOAST NOTIFICATIONS ---
                function showToast(msg) {
                    const toast = document.getElementById('toast');
                    document.getElementById('toast-message').innerText = msg;
                    toast.classList.remove('hidden');
                    setTimeout(() => hideToast(), 3500);
                }

                function hideToast() {
                    document.getElementById('toast').classList.add('hidden');
                }

                // --- SEARCH & FILTER ---
                function handleSearch(val) {
                    searchQuery = val.trim();
                    document.getElementById('clear-search-btn').classList.toggle('hidden', !searchQuery);
                    renderApp();
                }

                function clearSearch() {
                    document.getElementById('search-input').value = '';
                    searchQuery = '';
                    document.getElementById('clear-search-btn').classList.add('hidden');
                    renderApp();
                }

                function handleFilterChange(val) {
                    selectedStatus = val;
                    renderApp();
                }

                function switchView(view) {
                    activeView = view;
                    document.getElementById('view-board').classList.toggle('hidden', view !== 'board');
                    document.getElementById('view-list').classList.toggle('hidden', view !== 'list');

                    document.getElementById('btn-view-board').className = `px-3 py-1.5 rounded-md text-xs font-semibold transition flex items-center gap-1.5 ${view === 'board' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`;
                    document.getElementById('btn-view-list').className = `px-3 py-1.5 rounded-md text-xs font-semibold transition flex items-center gap-1.5 ${view === 'list' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`;
                }

                // --- RENDER FUNCTIONS ---
                function renderApp() {
                    const loggedOutView = document.getElementById('logged-out-view');
                    const loggedInView = document.getElementById('logged-in-view');
                    const headerActions = document.getElementById('portal-header-actions');

                    if (!currentUser) {
                        if (loggedOutView) loggedOutView.classList.remove('hidden');
                        if (loggedInView) loggedInView.classList.add('hidden');
                        if (headerActions) headerActions.classList.add('hidden');
                        if (typeof lucide !== 'undefined') lucide.createIcons();
                        return;
                    }

                    if (loggedOutView) loggedOutView.classList.add('hidden');
                    if (loggedInView) loggedInView.classList.remove('hidden');
                    if (headerActions) headerActions.classList.remove('hidden');

                    const filtered = invoices.filter(inv => {
                        const matchSearch = 
                            inv.vendor.toLowerCase().includes(searchQuery.toLowerCase()) ||
                            inv.invoiceNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
                            inv.grantCode.toLowerCase().includes(searchQuery.toLowerCase()) ||
                            (inv.completed?.poNumber && inv.completed.poNumber.toLowerCase().includes(searchQuery.toLowerCase())) ||
                            inv.items.some(i => i.name.toLowerCase().includes(searchQuery.toLowerCase()));

                        const matchStatus = selectedStatus === 'ALL' || inv.status === selectedStatus;
                        return matchSearch && matchStatus;
                    });

                    const totalCount = invoices.length;
                    const subCount = invoices.filter(i => i.status === 'SUBMITTED' || i.status === 'REJECTED').length;
                    const accCount = invoices.filter(i => i.status === 'ACCOUNTANT_RECEIVED').length;
                    const offCount = invoices.filter(i => i.status === 'OFFICE_RECEIVED').length;
                    const comCount = invoices.filter(i => i.status === 'COMPLETED').length;
                    const totalSpend = invoices.reduce((sum, i) => sum + i.totalPrice, 0);

                    document.getElementById('stat-total-count').innerText = totalCount;
                    document.getElementById('stat-total-spend').innerText = `₹${totalSpend.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
                    document.getElementById('stat-submitted-count').innerText = subCount;
                    document.getElementById('stat-accountant-count').innerText = accCount;
                    document.getElementById('stat-office-count').innerText = offCount;
                    document.getElementById('stat-completed-count').innerText = comCount;

                    document.getElementById('badge-stage-1').innerText = subCount;
                    document.getElementById('badge-stage-2').innerText = accCount;
                    document.getElementById('badge-stage-3').innerText = offCount;
                    document.getElementById('badge-stage-4').innerText = comCount;

                    renderKanbanColumn('col-stage-1', filtered.filter(i => i.status === 'SUBMITTED' || i.status === 'REJECTED'), 'SUBMITTED');
                    renderKanbanColumn('col-stage-2', filtered.filter(i => i.status === 'ACCOUNTANT_RECEIVED'), 'ACCOUNTANT_RECEIVED');
                    renderKanbanColumn('col-stage-3', filtered.filter(i => i.status === 'OFFICE_RECEIVED'), 'OFFICE_RECEIVED');
                    renderKanbanColumn('col-stage-4', filtered.filter(i => i.status === 'COMPLETED'), 'COMPLETED');

                    renderTableView(filtered);
                    if (typeof lucide !== 'undefined') lucide.createIcons();
                }

                function renderKanbanColumn(containerId, columnInvoices, stageKey) {
                    const container = document.getElementById(containerId);
                    if (columnInvoices.length === 0) {
                        container.innerHTML = `<div class="text-center py-8 text-xs text-slate-400 bg-white/50 rounded-sm border border-dashed border-slate-200">No invoices in this stage</div>`;
                        return;
                    }

                    const activeRole = currentUser ? currentUser.role : null;

                    container.innerHTML = columnInvoices.map(inv => {
                        const isRejected = inv.status === 'REJECTED';
                        const isCreator = isInvoiceCreator(inv, currentUser);
                        const canManagerEdit = isCreator && (inv.status === 'SUBMITTED' || inv.status === 'REJECTED');
                        const canAccountantEdit = activeRole === 'Lab Accountant';

                        return `
                            <div onclick="openDetailsModal('${inv.id}')" class="bg-white p-4 rounded-sm border ${isRejected ? 'border-rose-300 bg-rose-50/20' : 'border-slate-200'} shadow-sm hover:shadow-md transition cursor-pointer group hover:border-indigo-300">
                                <div class="flex items-start justify-between gap-2 mb-2">
                                    <span class="font-mono font-bold text-indigo-700 text-xs group-hover:underline">${inv.invoiceNumber}</span>
                                    <span class="text-xs font-bold text-slate-900 font-mono">₹${inv.totalPrice.toFixed(2)}</span>
                                </div>
                                <h4 class="font-bold text-slate-900 text-sm leading-snug line-clamp-1">${inv.vendor}</h4>
                                <div class="flex items-center gap-1 text-[11px] text-slate-500 mt-1">
                                    <i data-lucide="tag" class="w-3 h-3 text-slate-400"></i>
                                    <span class="font-mono font-semibold ${inv.grantCode === 'UNASSIGNED' ? 'text-amber-600' : 'text-indigo-800'}">${inv.grantCode}</span>
                                    <span class="text-slate-300">&bull;</span>
                                    <span>${inv.invoiceDate}</span>
                                </div>
                                ${isRejected ? `
                                    <div class="mt-2 p-2 bg-rose-50 border border-rose-200 rounded text-[11px] text-rose-800 font-medium">
                                        <span class="font-bold flex items-center gap-1"><i data-lucide="alert-circle" class="w-3 h-3"></i> Rejected by Accountant:</span>
                                        <p class="mt-0.5 line-clamp-2 italic">"${inv.rejectionReason || 'Details incorrect'}"</p>
                                    </div>
                                ` : ''}
                                <div class="mt-2 text-xs text-slate-600 bg-slate-50 p-2 rounded border border-slate-100 line-clamp-2">
                                    <span class="font-semibold text-slate-700">Items: </span>
                                    ${inv.items.map(i => `${i.quantity}x ${i.name}`).join(', ')}
                                </div>
                                <div class="mt-3 pt-2 border-t border-slate-100 flex flex-col gap-1.5">
                                    <div class="flex items-center justify-between text-[10px] text-slate-400">
                                        <span>Added by: ${inv.created.by}</span>
                                        <div class="flex items-center gap-1">
                                            ${inv.comments && inv.comments.length > 0 ? `<span class="text-indigo-600 font-bold flex items-center gap-0.5"><i data-lucide="message-square" class="w-3 h-3"></i> ${inv.comments.length}</span>` : ''}
                                            <i data-lucide="clock" class="w-3 h-3"></i>
                                        </div>
                                    </div>
                                    ${canManagerEdit ? `
                                        <div class="flex gap-1.5 mt-1">
                                            <button onclick="event.stopPropagation(); openEditModal('${inv.id}')" class="flex-1 bg-amber-500 hover:bg-amber-600 text-white font-semibold text-[11px] py-1.5 px-2 rounded-sm flex items-center justify-center gap-1 shadow-sm transition">
                                                <i data-lucide="edit-3" class="w-3 h-3"></i> ${isRejected ? 'Edit & Resubmit' : 'Edit'}
                                            </button>
                                            <button onclick="event.stopPropagation(); deleteInvoice('${inv.id}')" class="bg-rose-500 hover:bg-rose-600 text-white font-semibold text-[11px] py-1.5 px-2 rounded-sm flex items-center justify-center gap-1 shadow-sm transition">
                                                <i data-lucide="trash-2" class="w-3 h-3"></i>
                                            </button>
                                        </div>
                                    ` : ''}
                                    ${stageKey === 'SUBMITTED' && activeRole === 'Lab Accountant' ? `
                                        <div class="flex gap-1.5 mt-1">
                                            <button onclick="event.stopPropagation(); acceptInvoice('${inv.id}')" class="flex-1 bg-blue-800 hover:bg-blue-600 text-white font-semibold text-[11px] py-1.5 px-2 rounded-sm flex items-center justify-center gap-1 shadow-sm transition">
                                                <i data-lucide="check-circle" class="w-3 h-3"></i> Accept
                                            </button>
                                            <button onclick="event.stopPropagation(); openRejectModal('${inv.id}')" class="flex-1 bg-rose-800 hover:bg-rose-700 text-white font-semibold text-[11px] py-1.5 px-2 rounded-sm flex items-center justify-center gap-1 shadow-sm transition">
                                                <i data-lucide="x-circle" class="w-3 h-3"></i> Reject
                                            </button>
                                        </div>
                                    ` : ''}
                                    ${canAccountantEdit && (stageKey === 'ACCOUNTANT_RECEIVED' || stageKey === 'OFFICE_RECEIVED' || stageKey === 'COMPLETED') ? `
                                        <div class="flex gap-1.5 mt-1">
                                            ${stageKey === 'ACCOUNTANT_RECEIVED' ? `
                                                <button onclick="event.stopPropagation(); openSendToOfficeModal('${inv.id}')" class="flex-1 bg-purple-800 hover:bg-purple-700 text-white font-semibold text-[11px] py-1.5 px-2 rounded-sm flex items-center justify-center gap-1 shadow-sm transition">
                                                    <i data-lucide="send" class="w-3 h-3"></i> Send to OC Office
                                                </button>
                                            ` : ''}
                                            <button onclick="event.stopPropagation(); openEditModal('${inv.id}')" class="bg-slate-700 hover:bg-slate-800 text-white font-semibold text-[11px] py-1.5 px-2 rounded-sm flex items-center justify-center gap-1 shadow-sm transition" title="Accountant Edit">
                                                <i data-lucide="edit-3" class="w-3 h-3"></i> Edit
                                            </button>
                                        </div>
                                    ` : ''}
                                    ${stageKey === 'OFFICE_RECEIVED' && activeRole === 'Office Staff' ? `
                                        <button onclick="event.stopPropagation(); openPoModal('${inv.id}')" class="w-full mt-1 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs py-2 px-3 rounded-sm flex items-center justify-center gap-1.5 shadow-sm transition">
                                            <i data-lucide="plus-circle" class="w-3.5 h-3.5"></i> Attach PO & Process
                                        </button>
                                    ` : ''}
                                    ${stageKey === 'COMPLETED' ? `
                                        <div class="mt-1 p-2 bg-emerald-50 rounded-sm border border-emerald-200 text-xs">
                                            <div class="text-[10px] text-emerald-600 font-semibold uppercase">Purchase Order Number</div>
                                            <div class="font-mono font-bold text-emerald-900">${inv.completed.poNumber}</div>
                                        </div>
                                    ` : ''}
                                </div>
                            </div>
                        `;
                    }).join('');
                }

                function renderTableView(filteredInvoices) {
                    const tbody = document.getElementById('table-body');
                    if (filteredInvoices.length === 0) {
                        tbody.innerHTML = `<tr><td colSpan="9" class="text-center py-8 text-slate-400">No matching invoices found.</td></tr>`;
                        return;
                    }

                    const activeRole = currentUser ? currentUser.role : null;

                    tbody.innerHTML = filteredInvoices.map(inv => `
                        <tr onclick="openDetailsModal('${inv.id}')" class="hover:bg-slate-50/80 cursor-pointer transition ${inv.status === 'REJECTED' ? 'bg-rose-50/30' : ''}">
                            <td class="py-3 px-4 font-bold text-indigo-700 font-mono">${inv.invoiceNumber}</td>
                            <td class="py-3 px-4 font-semibold text-slate-800">${inv.vendor}</td>
                            <td class="py-3 px-4">
                                <span class="inline-block px-2 py-0.5 rounded font-mono text-[10px] ${inv.grantCode === 'UNASSIGNED' ? 'bg-amber-100 text-amber-800 border border-amber-200' : 'bg-slate-100 border border-slate-200 text-slate-700'}">
                                    ${inv.grantCode}
                                </span>
                            </td>
                            <td class="py-3 px-4 text-slate-600">${inv.invoiceDate}</td>
                            <td class="py-3 px-4 max-w-xs truncate text-slate-600">${inv.items.map(i => `${i.quantity}x ${i.name}`).join(', ')}</td>
                            <td class="py-3 px-4 font-bold text-slate-900 font-mono">₹${inv.totalPrice.toFixed(2)}</td>
                            <td class="py-3 px-4">${getBadgeHtml(inv.status)}</td>
                            <td class="py-3 px-4 font-mono font-bold text-emerald-700">
                                ${inv.completed?.poNumber || '<span class="text-slate-400 font-normal font-sans text-[11px]">Unassigned</span>'}
                            </td>
                            <td class="py-3 px-4 text-right" onclick="event.stopPropagation()">
                                <div class="flex items-center justify-end gap-1.5">
                                    ${(inv.status === 'SUBMITTED' || inv.status === 'REJECTED') && isInvoiceCreator(inv, currentUser) ? `
                                        <button onclick="openEditModal('${inv.id}')" class="px-2 py-1 bg-amber-500 text-white rounded text-[11px] font-semibold">Edit</button>
                                        <button onclick="deleteInvoice('${inv.id}')" class="px-2 py-1 bg-rose-600 text-white rounded text-[11px] font-semibold">Delete</button>
                                    ` : ''}
                                    ${inv.status === 'SUBMITTED' && activeRole === 'Lab Accountant' ? `
                                        <button onclick="acceptInvoice('${inv.id}')" class="px-2.5 py-1 bg-blue-600 text-white rounded text-[11px] font-semibold">Accept</button>
                                        <button onclick="openRejectModal('${inv.id}')" class="px-2 py-1 bg-rose-600 text-white rounded text-[11px] font-semibold">Reject</button>
                                    ` : ''}
                                    ${inv.status === 'ACCOUNTANT_RECEIVED' && activeRole === 'Lab Accountant' ? `
                                        <button onclick="openSendToOfficeModal('${inv.id}')" class="px-2.5 py-1 bg-purple-600 text-white rounded text-[11px] font-semibold">To Office</button>
                                    ` : ''}
                                    ${activeRole === 'Lab Accountant' ? `
                                        <button onclick="openEditModal('${inv.id}')" class="px-2 py-1 bg-slate-700 text-white rounded text-[11px] font-semibold">Edit</button>
                                    ` : ''}
                                    ${inv.status === 'OFFICE_RECEIVED' && activeRole === 'Office Staff' ? `
                                        <button onclick="openPoModal('${inv.id}')" class="px-2.5 py-1 bg-emerald-600 text-white rounded text-[11px] font-semibold">Attach PO</button>
                                    ` : ''}
                                    <button onclick="openDetailsModal('${inv.id}')" class="p-1 hover:bg-slate-200 rounded text-slate-500">
                                        <i data-lucide="chevron-right" class="w-4 h-4"></i>
                                    </button>
                                </div>
                            </td>
                        </tr>
                    `).join('');
                }

                function getBadgeHtml(status) {
                    switch (status) {
                        case 'SUBMITTED':
                            return `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-sm text-[11px] font-semibold bg-amber-100 text-amber-800 border border-amber-200"><i data-lucide="clock" class="w-3 h-3"></i> Stage 1: Submitted</span>`;
                        case 'REJECTED':
                            return `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-sm text-[11px] font-semibold bg-rose-100 text-rose-800 border border-rose-200"><i data-lucide="x-circle" class="w-3 h-3"></i> Stage 1: Rejected</span>`;
                        case 'ACCOUNTANT_RECEIVED':
                            return `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-sm text-[11px] font-semibold bg-blue-100 text-blue-800 border border-blue-200"><i data-lucide="file-check" class="w-3 h-3"></i> Stage 2: Accountant Accepted</span>`;
                        case 'OFFICE_RECEIVED':
                            return `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-sm text-[11px] font-semibold bg-purple-100 text-purple-800 border border-purple-200"><i data-lucide="building-2" class="w-3 h-3"></i> Stage 3: In OrgChem Office</span>`;
                        case 'COMPLETED':
                            return `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-sm text-[11px] font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200"><i data-lucide="check-circle-2" class="w-3 h-3"></i> Stage 4: PO Processed</span>`;
                        default: return '';
                    }
                }

                // --- WORKFLOW ACTIONS ---
                async function acceptInvoice(invId) {
                    if (!currentUser) return;
                    const now = new Date();

                    const { error } = await supabaseClient
                        .from('invoices')
                        .update({
                            status: 'ACCOUNTANT_RECEIVED',
                            accountant_received_by: `${currentUser.name} (${currentUser.role})`,
                            accountant_received_at: now.toISOString()
                        })
                        .eq('id', invId);

                    if (error) {
                        console.error('Supabase update error:', error);
                        showToast('Failed to accept invoice in DB.');
                        return;
                    }

                    await fetchInvoicesFromSupabase();
                    showToast('Invoice accepted by Accountant!');
                }

                function openSendToOfficeModal(invId) {
                    selectedInvoice = invoices.find(i => i.id === invId);
                    if (!selectedInvoice) return;

                    document.getElementById('send-office-modal-vendor').innerText = selectedInvoice.vendor;
                    document.getElementById('send-office-modal-invnum').innerText = selectedInvoice.invoiceNumber;
                    document.getElementById('send-office-modal-amount').innerText = `₹${selectedInvoice.totalPrice.toFixed(2)}`;
                    document.getElementById('send-office-grant-code-input').value = selectedInvoice.grantCode !== 'UNASSIGNED' ? selectedInvoice.grantCode : '';
                    document.getElementById('send-office-comment-input').value = '';
                    document.getElementById('modal-send-office').classList.remove('hidden');
                }

                function closeSendToOfficeModal() {
                    document.getElementById('modal-send-office').classList.add('hidden');
                }

                async function confirmSendToOffice() {
                    if (!selectedInvoice || !currentUser) return;
                    const grantVal = document.getElementById('send-office-grant-code-input').value.trim();
                    const commentVal = document.getElementById('send-office-comment-input').value.trim();

                    if (!grantVal) {
                        alert('Please enter a DEBIT HEAD before sending to office.');
                        return;
                    }

                    const now = new Date();
                    const timestamp = formatDate(now.toISOString());
                    const updatedComments = [...(selectedInvoice.comments || [])];

                    if (commentVal) {
                        updatedComments.push({ user: currentUser.name, text: commentVal, timestamp });
                    }

                    const { error } = await supabaseClient
                        .from('invoices')
                        .update({
                            grant_code: grantVal,
                            status: 'OFFICE_RECEIVED',
                            office_received_by: `${currentUser.name} (${currentUser.role})`,
                            office_received_at: now.toISOString(),
                            comments: updatedComments
                        })
                        .eq('id', selectedInvoice.id);

                    if (error) {
                        console.error('Supabase update error:', error);
                        showToast('Failed to send invoice to office.');
                        return;
                    }

                    closeSendToOfficeModal();
                    await fetchInvoicesFromSupabase();
                    showToast(`Invoice ${selectedInvoice.invoiceNumber} sent to Office!`);
                }

                function openRejectModal(invId) {
                    selectedInvoice = invoices.find(i => i.id === invId);
                    if (!selectedInvoice) return;

                    document.getElementById('reject-receiver-name').innerText = selectedInvoice.created.by;
                    document.getElementById('reject-reason-input').value = '';
                    document.getElementById('modal-reject').classList.remove('hidden');
                }

                function closeRejectModal() {
                    document.getElementById('modal-reject').classList.add('hidden');
                }

                async function confirmRejectInvoice() {
                    if (!selectedInvoice || !currentUser) return;
                    const reasonVal = document.getElementById('reject-reason-input').value.trim();

                    if (!reasonVal) {
                        alert('Please specify a rejection reason.');
                        return;
                    }

                    const now = new Date();
                    const timestamp = formatDate(now.toISOString());
                    const updatedComments = [...(selectedInvoice.comments || [])];
                    updatedComments.push({ user: currentUser.name, text: `[REJECTED]: ${reasonVal}`, timestamp });

                    const { error } = await supabaseClient
                        .from('invoices')
                        .update({
                            status: 'REJECTED',
                            rejection_reason: reasonVal,
                            comments: updatedComments
                        })
                        .eq('id', selectedInvoice.id);

                    if (error) {
                        console.error('Supabase rejection error:', error);
                        showToast('Failed to reject invoice.');
                        return;
                    }

                    closeRejectModal();
                    await fetchInvoicesFromSupabase();
                    showToast(`Invoice ${selectedInvoice.invoiceNumber} rejected back to Manager.`);
                }

                async function confirmCompletePO() {
                    if (!currentUser || !selectedInvoice) return;
                    const poNum = document.getElementById('input-po-number').value.trim();
                    if (!poNum) {
                        alert('Please enter a valid Purchase Order (PO) number.');
                        return;
                    }

                    const now = new Date();

                    const { error } = await supabaseClient
                        .from('invoices')
                        .update({
                            status: 'COMPLETED',
                            completed_by: currentUser.name,
                            completed_at: now.toISOString(),
                            po_number: poNum
                        })
                        .eq('id', selectedInvoice.id);

                    if (error) {
                        console.error('Supabase complete PO error:', error);
                        showToast('Failed to complete PO in database.');
                        return;
                    }

                    closePoModal();
                    await fetchInvoicesFromSupabase();
                    showToast(`Purchase Order ${poNum} attached & Payment Processed!`);
                }

                function openAddModal() {
                    if (!currentUser) return;

                    if (!isConsumableManager(currentUser.role)) {
                        showToast('Only Solvent, Chemical, or Glassware Managers can add invoices.');
                        return;
                    }

                    document.getElementById('edit-invoice-id').value = '';
                    document.getElementById('add-modal-title').innerText = 'Record Received Consumable Invoice';
                    document.getElementById('add-modal-submit-btn').innerHTML = '<i data-lucide="send" class="w-4 h-4"></i> Submit to Accountant';

                    formItems = [{ name: '', quantity: 1, unitPrice: 0 }];
                    document.getElementById('input-vendor').value = '';
                    document.getElementById('input-invoice-number').value = '';
                    document.getElementById('input-notes').value = '';
                    document.getElementById('input-invoice-date').value = new Date().toISOString().split('T')[0];

                    renderFormItems();
                    document.getElementById('modal-add').classList.remove('hidden');
                    if (typeof lucide !== 'undefined') lucide.createIcons();
                }

                function openEditModal(invId) {
                    const inv = invoices.find(i => i.id === invId);
                    if (!inv) return;

                    const activeRole = currentUser ? currentUser.role : null;
                    const isCreator = isInvoiceCreator(inv, currentUser);
                    const canEdit = (isCreator && (inv.status === 'SUBMITTED' || inv.status === 'REJECTED')) || activeRole === 'Lab Accountant';

                    if (!canEdit) {
                        showToast('You do not have permission to edit this invoice.');
                        return;
                    }

                    document.getElementById('edit-invoice-id').value = inv.id;
                    document.getElementById('add-modal-title').innerText = `Edit Invoice (${inv.invoiceNumber})`;
                    document.getElementById('add-modal-submit-btn').innerHTML = '<i data-lucide="check" class="w-4 h-4"></i> Save Updated Invoice';

                    document.getElementById('input-vendor').value = inv.vendor;
                    document.getElementById('input-invoice-number').value = inv.invoiceNumber;
                    document.getElementById('input-invoice-date').value = inv.invoiceDate;
                    document.getElementById('input-notes').value = inv.notes || '';

                    formItems = inv.items.map(i => ({ name: i.name, quantity: i.quantity, unitPrice: i.unitPrice }));
                    renderFormItems();
                    document.getElementById('modal-add').classList.remove('hidden');
                    if (typeof lucide !== 'undefined') lucide.createIcons();
                }

                function closeAddModal() {
                    document.getElementById('modal-add').classList.add('hidden');
                }

                async function deleteInvoice(invId) {
                    const inv = invoices.find(i => i.id === invId);
                    if (!inv) return;

                    const isCreator = isInvoiceCreator(inv, currentUser);
                    const isStage1 = inv.status === 'SUBMITTED' || inv.status === 'REJECTED';

                    if (!isStage1 || !isCreator) {
                        showToast('Only the creator of this invoice can delete it prior to accountant acceptance.');
                        return;
                    }

                    if (!confirm('Are you sure you want to delete this invoice? This action cannot be undone.')) return;

                    const { error } = await supabaseClient.from('invoices').delete().eq('id', invId);

                    if (error) {
                        console.error('Supabase delete error:', error);
                        showToast('Failed to delete invoice.');
                        return;
                    }

                    await fetchInvoicesFromSupabase();
                    showToast('Invoice deleted successfully.');
                }

                function handleVendorSearch(val) {
                    const dropdown = document.getElementById('vendor-suggestions');
                    if (!val.trim()) {
                        dropdown.classList.add('hidden');
                        return;
                    }

                    const matches = vendors.filter(v => v.toLowerCase().includes(val.toLowerCase()));
                    if (matches.length === 0) {
                        dropdown.classList.add('hidden');
                        return;
                    }

                    dropdown.innerHTML = `
                        <div class="px-3 py-1 bg-slate-50 text-[10px] font-bold text-slate-400 uppercase">Previously Saved Vendors</div>
                        ${matches.map(v => `
                            <div onclick="selectVendor('${v.replace(/'/g, "\\'")}')" class="px-3 py-2 text-xs hover:bg-indigo-50 hover:text-indigo-700 cursor-pointer border-b border-slate-100 last:border-0">
                                ${v}
                            </div>
                        `).join('')}
                    `;
                    dropdown.classList.remove('hidden');
                }

                function selectVendor(vName) {
                    document.getElementById('input-vendor').value = vName;
                    document.getElementById('vendor-suggestions').classList.add('hidden');
                }

                function renderFormItems() {
                    const container = document.getElementById('form-items-container');
                    container.innerHTML = formItems.map((item, idx) => `
                        <div class="flex items-center gap-2 bg-slate-50 p-2 rounded-sm border border-slate-200">
                            <input
                                type="text"
                                placeholder="Item description (e.g. Taq Polymerase)"
                                value="${item.name}"
                                onchange="updateFormItem(${idx}, 'name', this.value)"
                                class="flex-1 px-2.5 py-1.5 bg-white border border-slate-300 rounded text-xs focus:ring-1 focus:ring-indigo-500"
                                required
                            />
                            <input
                                type="number"
                                min="1"
                                placeholder="Qty"
                                value="${item.quantity}"
                                onchange="updateFormItem(${idx}, 'quantity', this.value)"
                                class="w-16 px-2 py-1.5 bg-white border border-slate-300 rounded text-xs font-mono text-center focus:ring-1 focus:ring-indigo-500"
                                required
                            />
                            <input
                                type="number"
                                step="0.01"
                                min="0"
                                placeholder="Price ₹"
                                value="${item.unitPrice}"
                                onchange="updateFormItem(${idx}, 'unitPrice', this.value)"
                                class="w-24 px-2 py-1.5 bg-white border border-slate-300 rounded text-xs font-mono text-right focus:ring-1 focus:ring-indigo-500"
                                required
                            />
                            <span class="text-xs font-bold font-mono text-slate-700 w-20 text-right">
                                ₹${(item.quantity * item.unitPrice).toFixed(2)}
                            </span>
                            ${formItems.length > 1 ? `
                                <button type="button" onclick="removeFormItemRow(${idx})" class="text-slate-400 hover:text-rose-600 p-1">
                                    <i data-lucide="x" class="w-4 h-4"></i>
                                </button>
                            ` : ''}
                        </div>
                    `).join('');

                    const grandTotal = formItems.reduce((sum, item) => sum + (item.quantity * item.unitPrice), 0);
                    document.getElementById('form-calculated-total').innerText = `₹${grandTotal.toFixed(2)}`;
                    if (typeof lucide !== 'undefined') lucide.createIcons();
                }

                function addFormItemRow() {
                    formItems.push({ name: '', quantity: 1, unitPrice: 0 });
                    renderFormItems();
                }

                function removeFormItemRow(idx) {
                    if (formItems.length === 1) return;
                    formItems.splice(idx, 1);
                    renderFormItems();
                }

                function updateFormItem(idx, field, val) {
                    if (field === 'quantity' || field === 'unitPrice') {
                        formItems[idx][field] = parseFloat(val) || 0;
                    } else {
                        formItems[idx][field] = val;
                    }
                    renderFormItems();
                }

                async function handleCreateInvoice(e) {
                    e.preventDefault();
                    if (!currentUser) return;

                    const editId = document.getElementById('edit-invoice-id').value;
                    const vendorVal = document.getElementById('input-vendor').value.trim();
                    const invNumVal = document.getElementById('input-invoice-number').value.trim();
                    const invDateVal = document.getElementById('input-invoice-date').value;
                    const notesVal = document.getElementById('input-notes').value.trim();

                    if (!vendorVal || !invNumVal) {
                        alert('Please provide Vendor Name and Invoice Number.');
                        return;
                    }

                    const calculatedTotal = formItems.reduce((sum, i) => sum + (i.quantity * i.unitPrice), 0);
                    const now = new Date();

                    if (!vendors.some(v => v.toLowerCase() === vendorVal.toLowerCase())) {
                        vendors.push(vendorVal);
                    }

                    if (editId) {
                        const existingInv = invoices.find(i => i.id === editId);
                        const isResubmitting = existingInv && existingInv.status === 'REJECTED';

                        const { error: invErr } = await supabaseClient
                            .from('invoices')
                            .update({
                                vendor: vendorVal,
                                invoice_number: invNumVal,
                                invoice_date: invDateVal,
                                total_price: calculatedTotal,
                                notes: notesVal,
                                status: isResubmitting ? 'SUBMITTED' : existingInv.status,
                                rejection_reason: isResubmitting ? null : existingInv.rejectionReason
                            })
                            .eq('id', editId);

                        if (invErr) {
                            console.error('Error updating invoice:', invErr);
                            showToast('Failed to update invoice in database.');
                            return;
                        }

                        await supabaseClient.from('invoice_items').delete().eq('invoice_id', editId);
                        const dbItems = formItems.map(item => ({
                            invoice_id: editId,
                            item_name: item.name,
                            quantity: item.quantity,
                            unit_price: item.unitPrice
                        }));
                        await supabaseClient.from('invoice_items').insert(dbItems);

                        showToast(`Invoice ${invNumVal} updated!`);
                    } else {
                        const invId = `INV-${now.getFullYear()}-${Math.floor(100 + Math.random() * 900)}`;

                        const { error: invErr } = await supabaseClient
                            .from('invoices')
                            .insert({
                                id: invId,
                                vendor: vendorVal,
                                invoice_number: invNumVal,
                                invoice_date: invDateVal,
                                grant_code: 'UNASSIGNED',
                                total_price: calculatedTotal,
                                status: 'SUBMITTED',
                                created_by: `${currentUser.name} (${currentUser.role})`,
                                notes: notesVal
                            });

                        if (invErr) {
                            console.error('Supabase insert error:', invErr);
                            showToast('Failed to record invoice in database.');
                            return;
                        }

                        const dbItems = formItems.map(item => ({
                            invoice_id: invId,
                            item_name: item.name,
                            quantity: item.quantity,
                            unit_price: item.unitPrice
                        }));
                        await supabaseClient.from('invoice_items').insert(dbItems);

                        showToast(`Invoice ${invNumVal} recorded and sent to Accountant!`);
                    }

                    closeAddModal();
                    await fetchInvoicesFromSupabase();
                }

                function openPoModal(invId) {
                    selectedInvoice = invoices.find(i => i.id === invId);
                    document.getElementById('po-modal-vendor').innerText = selectedInvoice.vendor;
                    document.getElementById('po-modal-invnum').innerText = selectedInvoice.invoiceNumber;
                    document.getElementById('po-modal-amount').innerText = `₹${selectedInvoice.totalPrice.toFixed(2)}`;
                    document.getElementById('input-po-number').value = selectedInvoice.completed?.poNumber || `PO-UNI-${Math.floor(10000 + Math.random() * 90000)}`;
                    document.getElementById('modal-po').classList.remove('hidden');
                }

                function closePoModal() {
                    document.getElementById('modal-po').classList.add('hidden');
                }

                function openDetailsModal(invId) {
                    selectedInvoice = invoices.find(i => i.id === invId);
                    if (!selectedInvoice) return;

                    document.getElementById('detail-inv-num').innerText = selectedInvoice.invoiceNumber;
                    document.getElementById('detail-status-badge').innerHTML = getBadgeHtml(selectedInvoice.status);
                    document.getElementById('detail-vendor-grant').innerText = `${selectedInvoice.vendor} • Debit Head: ${selectedInvoice.grantCode}`;

                    const rejBanner = document.getElementById('detail-rejection-banner');
                    if (selectedInvoice.status === 'REJECTED') {
                        document.getElementById('detail-rejection-reason').innerText = `"${selectedInvoice.rejectionReason || 'Details incorrect'}"`;
                        rejBanner.classList.remove('hidden');
                    } else {
                        rejBanner.classList.add('hidden');
                    }

                    document.getElementById('detail-items-table').innerHTML = selectedInvoice.items.map(item => `
                        <tr>
                            <td class="py-2 px-3 font-medium text-slate-800">${item.name}</td>
                            <td class="py-2 px-3 text-center font-mono">${item.quantity}</td>
                            <td class="py-2 px-3 text-right font-mono">₹${item.unitPrice.toFixed(2)}</td>
                            <td class="py-2 px-3 text-right font-mono font-bold text-slate-900">₹${(item.quantity * item.unitPrice).toFixed(2)}</td>
                        </tr>
                    `).join('');
                    document.getElementById('detail-grand-total').innerText = `₹${selectedInvoice.totalPrice.toFixed(2)}`;

                    const notesBox = document.getElementById('detail-notes-box');
                    if (selectedInvoice.notes) {
                        document.getElementById('detail-notes-content').innerText = selectedInvoice.notes;
                        notesBox.classList.remove('hidden');
                    } else {
                        notesBox.classList.add('hidden');
                    }

                    document.getElementById('detail-timeline-container').innerHTML = `
                        <div class="relative flex items-start gap-3">
                            <div class="absolute -left-6 top-0.5 w-5 h-5 rounded-full bg-emerald-500 text-white flex items-center justify-center text-[10px] font-bold">✓</div>
                            <div class="bg-slate-50 p-3 rounded-sm border border-slate-200 w-full text-xs">
                                <div class="flex justify-between items-center">
                                    <span class="font-bold text-slate-800">1. Invoice Logged into Portal</span>
                                    <span class="text-[10px] font-mono text-slate-500">${selectedInvoice.created.timestamp || 'N/A'}</span>
                                </div>
                                <p class="text-slate-600 mt-1">Logged by <span class="font-semibold text-slate-800">${selectedInvoice.created.by}</span></p>
                            </div>
                        </div>

                        <div class="relative flex items-start gap-3">
                            <div class="absolute -left-6 top-0.5 w-5 h-5 rounded-full ${selectedInvoice.accountantReceived ? 'bg-blue-600 text-white' : (selectedInvoice.status === 'REJECTED' ? 'bg-rose-500 text-white' : 'bg-slate-200 text-slate-400')} flex items-center justify-center text-[10px] font-bold">
                                ${selectedInvoice.accountantReceived ? '✓' : (selectedInvoice.status === 'REJECTED' ? '✕' : '2')}
                            </div>
                            <div class="p-3 rounded-sm border w-full text-xs ${selectedInvoice.accountantReceived ? 'bg-slate-50 border-slate-200' : (selectedInvoice.status === 'REJECTED' ? 'bg-rose-50 border-rose-200 text-rose-900' : 'bg-white border-dashed border-slate-200 text-slate-400')}">
                                <div class="flex justify-between items-center">
                                    <span class="font-bold text-slate-800">2. Accountant Accepted Invoice</span>
                                    ${selectedInvoice.accountantReceived ? `<span class="text-[10px] font-mono text-slate-500">${selectedInvoice.accountantReceived.timestamp}</span>` : ''}
                                </div>
                                ${selectedInvoice.accountantReceived ? `
                                    <p class="text-slate-600 mt-1">Accepted by <span class="font-semibold text-slate-800">${selectedInvoice.accountantReceived.by}</span></p>
                                ` : (selectedInvoice.status === 'REJECTED' ? `
                                    <p class="mt-1 font-medium">Rejected back to Manager. Reason: ${selectedInvoice.rejectionReason}</p>
                                ` : '<p class="mt-1 italic">Pending Accountant acceptance...</p>')}
                            </div>
                        </div>

                        <div class="relative flex items-start gap-3">
                            <div class="absolute -left-6 top-0.5 w-5 h-5 rounded-full ${selectedInvoice.officeReceived ? 'bg-purple-600 text-white' : 'bg-slate-200 text-slate-400'} flex items-center justify-center text-[10px] font-bold">
                                ${selectedInvoice.officeReceived ? '✓' : '3'}
                            </div>
                            <div class="p-3 rounded-sm border w-full text-xs ${selectedInvoice.officeReceived ? 'bg-slate-50 border-slate-200' : 'bg-white border-dashed border-slate-200 text-slate-400'}">
                                <div class="flex justify-between items-center">
                                    <span class="font-bold text-slate-800">3. Debit Head Assigned & Handed to Office</span>
                                    ${selectedInvoice.officeReceived ? `<span class="text-[10px] font-mono text-slate-500">${selectedInvoice.officeReceived.timestamp}</span>` : ''}
                                </div>
                                ${selectedInvoice.officeReceived ? `
                                    <p class="text-slate-600 mt-1">Assigned Debit Head <span class="font-mono font-bold text-indigo-800">${selectedInvoice.grantCode}</span> & delivered by <span class="font-semibold text-slate-800">${selectedInvoice.officeReceived.by}</span></p>
                                ` : '<p class="mt-1 italic">Awaiting Accountant to assign Debit Head & send to Office...</p>'}
                            </div>
                        </div>

                        <div class="relative flex items-start gap-3">
                            <div class="absolute -left-6 top-0.5 w-5 h-5 rounded-full ${selectedInvoice.completed ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-400'} flex items-center justify-center text-[10px] font-bold">
                                ${selectedInvoice.completed ? '✓' : '4'}
                            </div>
                            <div class="p-3 rounded-sm border w-full text-xs ${selectedInvoice.completed ? 'bg-emerald-50/50 border-emerald-200' : 'bg-white border-dashed border-slate-200 text-slate-400'}">
                                <div class="flex justify-between items-center">
                                    <span class="font-bold text-slate-800">4. Purchase Order Linked & Payment Processed</span>
                                    ${selectedInvoice.completed ? `<span class="text-[10px] font-mono text-slate-500">${selectedInvoice.completed.timestamp}</span>` : ''}
                                </div>
                                ${selectedInvoice.completed ? `
                                    <div class="mt-1 space-y-1">
                                        <p class="text-slate-600">Processed by <span class="font-semibold text-slate-800">${selectedInvoice.completed.by}</span></p>
                                        <div class="inline-block bg-white px-2 py-1 rounded border border-emerald-300 font-mono font-bold text-emerald-900 text-xs">
                                            PO Number: ${selectedInvoice.completed.poNumber}
                                        </div>
                                    </div>
                                ` : '<p class="mt-1 italic">Awaiting Office to issue PO and process payment...</p>'}
                            </div>
                        </div>
                    `;

                    renderCommentsThread();

                    const actionsContainer = document.getElementById('detail-modal-actions');
                    const activeRole = currentUser ? currentUser.role : null;
                    const isCreator = isInvoiceCreator(selectedInvoice, currentUser);
                    let actionButtons = '';

                    if ((selectedInvoice.status === 'SUBMITTED' || selectedInvoice.status === 'REJECTED') && isCreator) {
                        actionButtons = `<button onclick="closeDetailsModal(); openEditModal('${selectedInvoice.id}')" class="px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-white font-semibold rounded text-xs flex items-center gap-1"><i data-lucide="edit-3" class="w-3.5 h-3.5"></i> Edit Invoice</button>`;
                    } else if (activeRole === 'Lab Accountant') {
                        actionButtons = `<button onclick="closeDetailsModal(); openEditModal('${selectedInvoice.id}')" class="px-3 py-1.5 bg-slate-700 hover:bg-slate-800 text-white font-semibold rounded text-xs flex items-center gap-1"><i data-lucide="edit-3" class="w-3.5 h-3.5"></i> Edit Invoice</button>`;
                    }

                    actionsContainer.innerHTML = actionButtons;
                    document.getElementById('modal-details').classList.remove('hidden');
                    if (typeof lucide !== 'undefined') lucide.createIcons();
                }

                function renderCommentsThread() {
                    const listContainer = document.getElementById('detail-comments-list');
                    const comments = selectedInvoice.comments || [];

                    if (comments.length === 0) {
                        listContainer.innerHTML = `<p class="text-slate-400 italic text-[11px] py-1">No comments posted yet.</p>`;
                        return;
                    }

                    listContainer.innerHTML = comments.map(c => `
                        <div class="bg-slate-50 p-2.5 rounded-sm border border-slate-200 text-xs space-y-0.5">
                            <div class="flex justify-between items-center text-[10px] text-slate-500">
                                <span class="font-bold text-slate-800">${c.user}</span>
                                <span class="font-mono">${c.timestamp}</span>
                            </div>
                            <p class="text-slate-700 leading-snug">${c.text}</p>
                        </div>
                    `).join('');
                }

                async function postComment() {
                    if (!currentUser || !selectedInvoice) return;
                    const input = document.getElementById('new-comment-input');
                    const textVal = input.value.trim();

                    if (!textVal) return;

                    const now = new Date();
                    const timestamp = formatDate(now.toISOString());
                    const newComment = { user: currentUser.name, text: textVal, timestamp };
                    const updatedComments = [...(selectedInvoice.comments || []), newComment];

                    const { error } = await supabaseClient
                        .from('invoices')
                        .update({ comments: updatedComments })
                        .eq('id', selectedInvoice.id);

                    if (error) {
                        console.error('Error posting comment:', error);
                        showToast('Failed to post comment.');
                        return;
                    }

                    input.value = '';
                    await fetchInvoicesFromSupabase();
                    if (selectedInvoice) {
                        selectedInvoice = invoices.find(i => i.id === selectedInvoice.id);
                        renderCommentsThread();
                    }
                    showToast('Comment added to invoice log');
                }

                function closeDetailsModal() {
                    document.getElementById('modal-details').classList.add('hidden');
                }
