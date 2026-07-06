const FIREBASE_CONFIG = {
  apiKey: "AIzaSyCvRlGwvHuiwcXuJQLFKzzrttOKTT0pS-s",
  authDomain: "iris-settlement.firebaseapp.com",
  databaseURL: "https://iris-settlement-default-rtdb.firebaseio.com",
  projectId: "iris-settlement",
  storageBucket: "iris-settlement.firebasestorage.app",
  messagingSenderId: "163710588431",
  appId: "1:163710588431:web:a4c697ead3b2453347357a",
  measurementId: "G-MZ0FSEYY0C",
};
const FIREBASE_DB_URL = "https://iris-settlement-default-rtdb.firebaseio.com";

const palette = ["#d87963", "#80b86e", "#70a8d8", "#b893d8", "#d6b84f", "#6fb9ad", "#df8f9c", "#9b9f6a"];
const storagePrefix = "settle-app:";

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));

let state = createEmptyState();
let setupDraftMembers = ["", "", "", ""];
let tripId = getTripId();
let dbRef = null;
let dbApi = null;
let remoteReady = false;
let hasPendingLocalWrite = false;
let toastTimer = null;

const els = {
  setupScreen: $("#setupScreen"),
  setupForm: $("#setupForm"),
  setupTripName: $("#setupTripName"),
  setupMemberRows: $("#setupMemberRows"),
  appShell: $("#appShell"),
  tripName: $("#tripName"),
  syncState: $("#syncState"),
  totalSpend: $("#totalSpend"),
  totalTransfer: $("#totalTransfer"),
  expenseCount: $("#expenseCount"),
  expenseList: $("#expenseList"),
  transferList: $("#transferList"),
  balanceList: $("#balanceList"),
  memberList: $("#memberList"),
  expenseDialog: $("#expenseDialog"),
  expenseForm: $("#expenseForm"),
  memberDialog: $("#memberDialog"),
  memberForm: $("#memberForm"),
  toast: $("#toast"),
};

init();

async function init() {
  wireEvents();
  await initStorage();
  render();
}

function createEmptyState() {
  return {
    meta: {
      name: "",
      baseCurrency: "KRW",
      foreignCurrency: "USD",
      defaultExchangeRate: 1300,
      setupComplete: false,
      updatedAt: Date.now(),
    },
    members: [],
    expenses: [],
    settled: {},
  };
}

function member(id, name, bank, account, color) {
  return { id, name, bank, account, color };
}

async function initStorage() {
  if (FIREBASE_CONFIG?.apiKey) {
    try {
      const [{ initializeApp }, db] = await Promise.all([
        import("https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js"),
        import("https://www.gstatic.com/firebasejs/10.12.5/firebase-database.js"),
      ]);
      const app = initializeApp({ ...FIREBASE_CONFIG, databaseURL: FIREBASE_DB_URL || FIREBASE_CONFIG.databaseURL });
      dbApi = db;
      dbRef = db.ref(db.getDatabase(app), `trips/${tripId}`);
      db.onValue(dbRef, (snapshot) => {
        const value = snapshot.val();
        remoteReady = true;
        if (value) {
          hasPendingLocalWrite = false;
          state = normalizeState(value);
        } else if (hasPendingLocalWrite && state.meta.setupComplete) {
          els.syncState.textContent = "Firebase 저장 확인 중";
          render();
          return;
        } else {
          state = createEmptyState();
        }
        els.syncState.textContent = "Firebase 실시간 동기화";
        render();
      });
      return;
    } catch (error) {
      console.error(error);
      showToast("Firebase 연결 실패");
    }
  }

  const saved = localStorage.getItem(storageKey());
  state = saved ? normalizeState(JSON.parse(saved)) : createEmptyState();
  remoteReady = true;
  els.syncState.textContent = "로컬 저장";
}

function normalizeState(value) {
  const members = Array.isArray(value.members) ? value.members : Object.values(value.members || {});
  const expenses = (Array.isArray(value.expenses) ? value.expenses : Object.values(value.expenses || {})).filter(
    (expense) => expense?.id !== "__empty__" && !expense?.hidden,
  );
  const meta = { ...createEmptyState().meta, ...(value.meta || {}) };
  meta.setupComplete = Boolean(meta.setupComplete || members.length || expenses.length);

  return {
    meta,
    members,
    expenses,
    settled: value.settled || {},
  };
}

function saveState() {
  state.meta.updatedAt = Date.now();
  if (dbRef && dbApi && remoteReady) {
    return dbApi.set(dbRef, serializeStateForDb(state));
  }
  localStorage.setItem(storageKey(), JSON.stringify(state));
  return Promise.resolve();
}

function serializeStateForDb(value) {
  return {
    ...value,
    expenses: value.expenses.length ? value.expenses : [{ id: "__empty__", hidden: true }],
  };
}

function wireEvents() {
  els.setupForm.addEventListener("submit", onSetupSubmit);
  $("#setupAddMemberBtn").addEventListener("click", () => {
    setupDraftMembers.push("");
    renderSetupMemberRows();
  });

  $$(".tab").forEach((button) => {
    button.addEventListener("click", () => switchTab(button.dataset.tab));
  });

  $("#copyLinkBtn").addEventListener("click", copyShareLink);
  $("#addExpenseBtn").addEventListener("click", () => openExpenseDialog());
  $("#addMemberBtn").addEventListener("click", () => openMemberDialog());
  $("#clearSettledBtn").addEventListener("click", () => {
    state.settled = {};
    saveState();
    render();
  });

  els.tripName.addEventListener("change", () => {
    state.meta.name = els.tripName.value.trim() || "정산";
    saveState();
    render();
  });

  els.expenseForm.addEventListener("submit", onExpenseSubmit);
  els.memberForm.addEventListener("submit", onMemberSubmit);
  $("#deleteExpenseBtn").addEventListener("click", deleteCurrentExpense);
  $("#deleteMemberBtn").addEventListener("click", deleteCurrentMember);

  $$("[data-close]").forEach((button) => {
    button.addEventListener("click", () => $(`#${button.dataset.close}`).close());
  });

  $("#expenseCurrency").addEventListener("change", () => {
    if ($("#expenseCurrency").value !== state.meta.baseCurrency && !$("#expenseRate").value) {
      $("#expenseRate").value = state.meta.defaultExchangeRate;
    }
  });
}

function switchTab(tab) {
  $$(".tab").forEach((button) => button.classList.toggle("active", button.dataset.tab === tab));
  $$(".panel").forEach((panel) => panel.classList.remove("active"));
  $(`#${tab}Panel`).classList.add("active");
}

function render() {
  if (!state.meta.setupComplete) {
    renderSetup();
    return;
  }

  els.setupScreen.hidden = true;
  els.appShell.hidden = false;
  const settlement = calculateSettlement();
  els.tripName.value = state.meta.name;
  els.totalSpend.textContent = money(settlement.totalSpend);
  els.totalTransfer.textContent = money(settlement.totalTransfer);
  els.expenseCount.textContent = `${state.expenses.length}건`;
  renderExpenses();
  renderTransfers(settlement.transfers);
  renderBalances(settlement.balances);
  renderMembers();
}

function renderSetup() {
  els.setupScreen.hidden = false;
  els.appShell.hidden = true;
  if (!els.setupTripName.value) {
    els.setupTripName.value = state.meta.name || "새 정산";
  }
  if (state.members.length) {
    setupDraftMembers = state.members.map((item) => item.name);
  }
  renderSetupMemberRows();
}

function renderSetupMemberRows() {
  els.setupMemberRows.innerHTML = setupDraftMembers
    .map((name, index) => `
      <div class="setup-member-row">
        <div class="setup-member-fields">
          <input type="text" value="${escapeHtml(name)}" maxlength="20" placeholder="이름" data-setup-member="${index}" />
        </div>
        <button class="icon-btn" type="button" data-remove-setup-member="${index}" aria-label="멤버 삭제">×</button>
      </div>
    `)
    .join("");

  $$("[data-setup-member]").forEach((input) => {
    input.addEventListener("input", () => {
      setupDraftMembers[Number(input.dataset.setupMember)] = input.value;
    });
  });

  $$("[data-remove-setup-member]").forEach((button) => {
    button.addEventListener("click", () => {
      if (setupDraftMembers.length <= 2) {
        showToast("멤버는 최소 2명 필요합니다");
        return;
      }
      setupDraftMembers.splice(Number(button.dataset.removeSetupMember), 1);
      renderSetupMemberRows();
    });
  });
}

function onSetupSubmit(event) {
  event.preventDefault();
  const names = $$("[data-setup-member]")
    .map((input) => input.value.trim())
    .filter(Boolean);
  const uniqueNames = [...new Set(names)];

  if (uniqueNames.length < 2) {
    showToast("멤버를 2명 이상 입력하세요");
    return;
  }

  state = {
    ...createEmptyState(),
    meta: {
      ...state.meta,
      name: els.setupTripName.value.trim() || "새 정산",
      setupComplete: true,
      updatedAt: Date.now(),
    },
    members: uniqueNames.map((name, index) => member(cryptoId(), name, "", "", palette[index % palette.length])),
    expenses: [],
    settled: {},
  };
  render();
  hasPendingLocalWrite = true;
  Promise.resolve(saveState()).catch((error) => {
    console.error(error);
    hasPendingLocalWrite = false;
    localStorage.setItem(storageKey(), JSON.stringify(state));
    els.syncState.textContent = "Firebase 저장 실패 · 로컬 저장";
    render();
    showToast("Firebase Rules를 확인하세요");
  });
  showToast("정산을 시작했습니다");
}

function renderExpenses() {
  if (!state.expenses.length) {
    els.expenseList.innerHTML = emptyCard("지출이 없습니다");
    return;
  }

  els.expenseList.innerHTML = [...state.expenses]
    .sort((a, b) => `${b.date}${b.createdAt}`.localeCompare(`${a.date}${a.createdAt}`))
    .map((expense) => {
      const payer = findMember(expense.payerId);
      const participants = expense.participantIds.map(findMember).filter(Boolean);
      const amount = amountKrw(expense);
      return `
        <article class="card expense-card">
          <div class="card-row">
            <div class="title-group">
              <h3 class="title">${escapeHtml(expense.title)}</h3>
              <div class="sub">${expense.date} · ${escapeHtml(payer?.name || "결제자 없음")}</div>
            </div>
            <div class="amount">${money(amount)}</div>
          </div>
          <div class="chips">
            ${participants.map((item) => `<span class="chip" style="background:${softColor(item.color)}">${escapeHtml(item.name)}</span>`).join("")}
          </div>
          <div class="transfer-actions">
            <button class="small-btn" type="button" data-edit-expense="${expense.id}">수정</button>
          </div>
        </article>
      `;
    })
    .join("");

  $$("[data-edit-expense]").forEach((button) => {
    button.addEventListener("click", () => openExpenseDialog(button.dataset.editExpense));
  });
}

function renderTransfers(transfers) {
  if (!transfers.length) {
    els.transferList.innerHTML = emptyCard("보낼 금액이 없습니다");
    return;
  }

  els.transferList.innerHTML = transfers
    .map((transfer) => {
      const from = findMember(transfer.fromId);
      const to = findMember(transfer.toId);
      const isSettled = Boolean(state.settled[transfer.key]);
      return `
        <article class="card transfer-card ${isSettled ? "settled" : ""}">
          <div class="transfer-main">
            <div class="person-pill">${escapeHtml(from?.name || "")}</div>
            <div class="arrow">→</div>
            <div class="person-pill">${escapeHtml(to?.name || "")}</div>
          </div>
          <div class="card-row" style="margin-top:12px">
            <div class="sub">${escapeHtml(to?.bank || "")} ${escapeHtml(to?.account || "")}</div>
            <div class="amount">${money(transfer.amount)}</div>
          </div>
          <div class="transfer-actions">
            <button class="small-btn" type="button" data-copy-account="${to?.id || ""}">계좌 복사</button>
            <button class="small-btn" type="button" data-toggle-settled="${transfer.key}">
              ${isSettled ? "완료 해제" : "정산 완료"}
            </button>
          </div>
        </article>
      `;
    })
    .join("");

  $$("[data-copy-account]").forEach((button) => {
    button.addEventListener("click", () => copyAccount(button.dataset.copyAccount));
  });
  $$("[data-toggle-settled]").forEach((button) => {
    button.addEventListener("click", () => {
      const key = button.dataset.toggleSettled;
      if (state.settled[key]) delete state.settled[key];
      else state.settled[key] = true;
      saveState();
      render();
    });
  });
}

function renderBalances(balances) {
  els.balanceList.innerHTML = state.members
    .map((item) => {
      const balance = balances[item.id] || 0;
      const className = balance > 0 ? "positive" : balance < 0 ? "negative" : "";
      return `
        <div class="balance-item">
          <span class="dot" style="background:${item.color}"></span>
          <strong>${escapeHtml(item.name)}</strong>
          <strong class="${className}">${money(balance)}</strong>
        </div>
      `;
    })
    .join("");
}

function renderMembers() {
  if (!state.members.length) {
    els.memberList.innerHTML = emptyCard("멤버가 없습니다");
    return;
  }

  els.memberList.innerHTML = state.members
    .map((item) => `
      <article class="card member-card">
        <div class="card-row">
          <div class="title-group">
            <h3 class="title"><span class="dot" style="background:${item.color}"></span> ${escapeHtml(item.name)}</h3>
            <div class="sub">${escapeHtml(item.bank || "")} ${escapeHtml(item.account || "")}</div>
          </div>
        </div>
        <div class="member-actions">
          <button class="small-btn" type="button" data-copy-account="${item.id}">계좌 복사</button>
          <button class="small-btn" type="button" data-edit-member="${item.id}">수정</button>
        </div>
      </article>
    `)
    .join("");

  $$("[data-edit-member]").forEach((button) => {
    button.addEventListener("click", () => openMemberDialog(button.dataset.editMember));
  });
  $$("[data-copy-account]").forEach((button) => {
    button.addEventListener("click", () => copyAccount(button.dataset.copyAccount));
  });
}

function calculateSettlement() {
  const balances = Object.fromEntries(state.members.map((item) => [item.id, 0]));
  let totalSpend = 0;

  state.expenses.forEach((expense) => {
    const participants = expense.participantIds.filter((id) => balances[id] !== undefined);
    const amount = amountKrw(expense);
    if (!participants.length || balances[expense.payerId] === undefined) return;
    totalSpend += amount;
    balances[expense.payerId] += amount;
    const share = amount / participants.length;
    participants.forEach((id) => {
      balances[id] -= share;
    });
  });

  const debtors = Object.entries(balances)
    .filter(([, value]) => value < -0.5)
    .map(([id, value]) => ({ id, amount: -value }))
    .sort((a, b) => b.amount - a.amount);
  const creditors = Object.entries(balances)
    .filter(([, value]) => value > 0.5)
    .map(([id, value]) => ({ id, amount: value }))
    .sort((a, b) => b.amount - a.amount);

  const transfers = [];
  let i = 0;
  let j = 0;
  while (i < debtors.length && j < creditors.length) {
    const amount = Math.min(debtors[i].amount, creditors[j].amount);
    const rounded = Math.round(amount);
    if (rounded > 0) {
      transfers.push({
        fromId: debtors[i].id,
        toId: creditors[j].id,
        amount: rounded,
        key: `${debtors[i].id}-${creditors[j].id}-${rounded}`,
      });
    }
    debtors[i].amount -= amount;
    creditors[j].amount -= amount;
    if (debtors[i].amount < 0.5) i += 1;
    if (creditors[j].amount < 0.5) j += 1;
  }

  return {
    balances,
    transfers,
    totalSpend,
    totalTransfer: transfers.reduce((sum, item) => sum + item.amount, 0),
  };
}

function openExpenseDialog(id = "") {
  const expense = state.expenses.find((item) => item.id === id);
  $("#expenseDialogTitle").textContent = expense ? "지출 수정" : "지출 추가";
  $("#expenseId").value = expense?.id || "";
  $("#expenseDate").value = expense?.date || today();
  $("#expenseTitle").value = expense?.title || "";
  $("#expenseAmount").value = expense?.amount || "";
  $("#expenseCurrency").value = expense?.currency || state.meta.baseCurrency;
  $("#expenseRate").value = expense?.exchangeRate || state.meta.defaultExchangeRate;
  $("#expenseNote").value = expense?.note || "";
  $("#deleteExpenseBtn").style.visibility = expense ? "visible" : "hidden";
  renderMemberSelect($("#expensePayer"), expense?.payerId);
  renderParticipantChecks(expense?.participantIds || state.members.map((item) => item.id));
  els.expenseDialog.showModal();
}

function renderMemberSelect(select, selectedId) {
  select.innerHTML = state.members
    .map((item) => `<option value="${item.id}" ${item.id === selectedId ? "selected" : ""}>${escapeHtml(item.name)}</option>`)
    .join("");
}

function renderParticipantChecks(selectedIds) {
  $("#participantChecks").innerHTML = state.members
    .map((item) => `
      <label class="check-tile">
        <input type="checkbox" value="${item.id}" ${selectedIds.includes(item.id) ? "checked" : ""} />
        <span>${escapeHtml(item.name)}</span>
      </label>
    `)
    .join("");
}

function onExpenseSubmit(event) {
  event.preventDefault();
  if (!state.members.length) {
    showToast("멤버를 먼저 추가하세요");
    return;
  }
  const participantIds = $$("#participantChecks input:checked").map((input) => input.value);
  if (!participantIds.length) {
    showToast("나눌 사람을 선택하세요");
    return;
  }

  const id = $("#expenseId").value || cryptoId();
  const expense = {
    id,
    date: $("#expenseDate").value,
    title: $("#expenseTitle").value.trim(),
    amount: Number($("#expenseAmount").value),
    currency: $("#expenseCurrency").value,
    exchangeRate: Number($("#expenseRate").value || 1),
    payerId: $("#expensePayer").value,
    participantIds,
    note: $("#expenseNote").value.trim(),
    createdAt: state.expenses.find((item) => item.id === id)?.createdAt || Date.now(),
  };

  state.expenses = state.expenses.filter((item) => item.id !== id).concat(expense);
  saveState();
  els.expenseDialog.close();
  render();
}

function deleteCurrentExpense() {
  const id = $("#expenseId").value;
  state.expenses = state.expenses.filter((item) => item.id !== id);
  saveState();
  els.expenseDialog.close();
  render();
}

function openMemberDialog(id = "") {
  const item = state.members.find((memberItem) => memberItem.id === id);
  $("#memberDialogTitle").textContent = item ? "멤버 수정" : "멤버 추가";
  $("#memberId").value = item?.id || "";
  $("#memberName").value = item?.name || "";
  $("#memberBank").value = item?.bank || "";
  $("#memberAccount").value = item?.account || "";
  $("#memberColor").value = item?.color || palette[state.members.length % palette.length];
  $("#deleteMemberBtn").style.visibility = item ? "visible" : "hidden";
  els.memberDialog.showModal();
}

function onMemberSubmit(event) {
  event.preventDefault();
  const id = $("#memberId").value || cryptoId();
  const next = {
    id,
    name: $("#memberName").value.trim(),
    bank: $("#memberBank").value.trim(),
    account: $("#memberAccount").value.trim(),
    color: $("#memberColor").value,
  };
  state.members = state.members.filter((item) => item.id !== id).concat(next);
  saveState();
  els.memberDialog.close();
  render();
}

function deleteCurrentMember() {
  const id = $("#memberId").value;
  if (state.members.length <= 2) {
    showToast("멤버는 최소 2명 필요합니다");
    return;
  }
  const used = state.expenses.some((expense) => expense.payerId === id || expense.participantIds.includes(id));
  if (used) {
    showToast("지출에 사용된 멤버입니다");
    return;
  }
  state.members = state.members.filter((item) => item.id !== id);
  saveState();
  els.memberDialog.close();
  render();
}

function amountKrw(expense) {
  if (expense.currency === state.meta.baseCurrency) return Number(expense.amount || 0);
  return Number(expense.amount || 0) * Number(expense.exchangeRate || state.meta.defaultExchangeRate || 1);
}

function findMember(id) {
  return state.members.find((item) => item.id === id);
}

async function copyShareLink() {
  await copyText(location.href);
  showToast("링크를 복사했습니다");
}

async function copyAccount(id) {
  const item = findMember(id);
  if (!item?.account) {
    showToast("계좌번호가 없습니다");
    return;
  }
  await copyText(`${item.bank} ${item.account}`.trim());
  showToast("계좌를 복사했습니다");
}

async function copyText(text) {
  if (navigator.clipboard) {
    await navigator.clipboard.writeText(text);
  }
}

function showToast(message) {
  els.toast.textContent = message;
  els.toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => els.toast.classList.remove("show"), 1700);
}

function emptyCard(text) {
  return `<div class="card empty-card"><div class="sub">${text}</div></div>`;
}

function money(value) {
  const rounded = Math.round(Number(value || 0));
  return new Intl.NumberFormat("ko-KR", {
    style: "currency",
    currency: "KRW",
    maximumFractionDigits: 0,
  }).format(rounded);
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function cryptoId() {
  const array = new Uint8Array(16);
  crypto.getRandomValues(array);
  return Array.from(array, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function getTripId() {
  const hashMatch = location.hash.match(/trip\/([A-Za-z0-9_-]+)/);
  const query = new URLSearchParams(location.search);
  const existing = hashMatch?.[1] || query.get("trip");
  if (existing) return existing;
  const created = cryptoId() + cryptoId();
  history.replaceState(null, "", `${location.pathname}${location.search}#/trip/${created}`);
  return created;
}

function storageKey() {
  return `${storagePrefix}${tripId}`;
}

function softColor(color) {
  return `${color}33`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
