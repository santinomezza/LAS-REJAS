import { db, auth } from './firebase.js';
import {
    collection,
    onSnapshot,
    query,
    orderBy,
    doc,
    updateDoc,
    deleteDoc,
    addDoc,
    where,
    getDocs,
    Timestamp
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import {
    signInWithEmailAndPassword,
    onAuthStateChanged,
    signOut
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

// ─── VARIABLES Y ESTADO ───
let bookings = [];
let inscriptions = [];
let blocks = [];
let revenueChart = null;
let sportsChart = null;

const availabilityHours = ['8:00', '9:00', '10:00', '11:00', '14:00', '15:00', '16:00', '17:00', '18:00', '19:00', '20:00', '21:00'];
const calendarDays = ['Lun 31/3', 'Mar 1/4', 'Mié 2/4', 'Jue 3/4', 'Vie 4/4', 'Sáb 5/4', 'Dom 6/4'];

const courtCounts = {
    'Pádel': 4,
    'Tenis': 2,
    'Fútbol': 1,
    'Natación': 1
};

// ─── AUTHENTICATION ───
onAuthStateChanged(auth, (user) => {
    const overlay = document.getElementById('login-overlay');
    if (user) {
        overlay.style.display = 'none';
        initDashboard();
    } else {
        overlay.style.display = 'flex';
    }
});

async function login() {
    const email = document.getElementById('admin-email').value.trim();
    const pass = document.getElementById('admin-pass').value;

    if (!email || !pass) {
        alert('Por favor completa ambos campos.');
        return;
    }

    try {
        await signInWithEmailAndPassword(auth, email, pass);
    } catch (error) {
        console.error("Login error:", error);
        alert('Error: Credenciales incorrectas o problema de conexión.');
    }
}

async function logout() {
    await signOut(auth);
    location.reload();
}

// ─── DASHBOARD LOGIC ───
function initDashboard() {
    // Sincronización en tiempo real de Reservas
    const qBookings = query(collection(db, "bookings"), orderBy("timestamp", "desc"));
    onSnapshot(qBookings, (snapshot) => {
        bookings = snapshot.docs.map(doc => ({
            fireId: doc.id,
            ...doc.data()
        }));
        updateUI();
    });

    // Sincronización en tiempo real de Inscripciones (Colonia)
    const qInscriptions = query(collection(db, "inscriptions"), orderBy("timestamp", "desc"));
    onSnapshot(qInscriptions, (snapshot) => {
        inscriptions = snapshot.docs.map(doc => ({
            fireId: doc.id,
            ...doc.data()
        }));
        updateUI();
    });

    // Sincronización en tiempo real de Bloqueos de horarios
    const qBlocks = query(collection(db, "blocks"));
    onSnapshot(qBlocks, (snapshot) => {
        blocks = snapshot.docs.map(doc => ({
            fireId: doc.id,
            ...doc.data()
        }));
        updateUI();
    });

    // Ejecutar limpieza de turnos viejos (> 7 días)
    cleanupOldBookings();
}

function updateUI() {
    renderStats();
    renderBookings();
    renderFullBookings();
    renderRestoBookings();
    renderOccupancy();
    updateSidebarCounters();
    
    // Nuevos módulos
    renderReports();
    renderColonia();
    renderBlocks();
    
    // Secciones especializadas
    renderSportBookings('Pádel', 'padel-bookings-tbody');
    renderSportBookings('Tenis', 'tenis-bookings-tbody');
    renderAdminCalendar();
    renderNotifications();
}

// Eliminar loadData antigua

function renderStats() {
    const now = new Date();
    const today = now.toLocaleDateString('es-AR', { weekday: 'short', day: 'numeric', month: 'numeric' });

    // Normalizar formato de fecha si es necesario (el script.js usa "Lun 31/3")
    // Para simplificar filtramos por el string que genera el script.js
    const todayStr = getTodayString();

    const todayBookings = bookings.filter(b => b.fecha.includes(todayStr) || b.fecha === todayStr);
    const pending = bookings.filter(b => b.estado === 'Pendiente');
    const canceled = bookings.filter(b => b.estado === 'Cancelado');

    // Ingresos estimados y reales
    const prices = { 'Pádel': 3500, 'Tenis': 3000, 'Natación': 2500, 'Fútbol': 4000, 'Clases de Pádel': 5000, 'Clases de Tenis': 4500 };
    const totalProjected = todayBookings.reduce((acc, b) => acc + (prices[b.deporte] || 0), 0);
    const totalPaidSeñas = todayBookings.filter(b => b.pagoSena === 'Pagado').reduce((acc, b) => acc + (b.senaMonto || 0), 0);

    document.getElementById('stat-turnos-hoy').textContent = todayBookings.length;
    
    // Alarma visual para pendientes
    const pendingEl = document.getElementById('stat-pedientes');
    const pendingCard = document.getElementById('card-pending-attention');
    if (pendingEl) pendingEl.textContent = pending.length;
    if (pendingCard) {
        if (pending.length > 0) {
            pendingCard.classList.add('has-pending');
        } else {
            pendingCard.classList.remove('has-pending');
        }
    }

    document.getElementById('stat-cancelados').textContent = canceled.length;
    document.getElementById('stat-ingresos').textContent = `$${(totalProjected / 1000).toFixed(1)}k`;
}

function renderBookings() {
    const tbody = document.getElementById('bookings-tbody');
    if (!tbody) return;

    // Filtrar solo los de hoy para el dashboard
    const now = new Date();
    const numericDate = `${now.getDate()}/${now.getMonth() + 1}`;
    const todayBookings = bookings.filter(b => b.fecha.includes(numericDate));
    
    // Mostrar solo los últimos 5 de hoy
    const displayList = [...todayBookings].reverse().slice(0, 5);

    tbody.innerHTML = displayList.map(b => {
        const sportColor = getSportColor(b.deporte);
        return `
        <tr style="background: ${sportColor}10;">
            <td style="border-left: 6px solid ${sportColor}; padding-left: 12px; font-weight: 600;">${b.hora} hs</td>
            <td><strong>${b.nombre}</strong><br><small style="color:var(--text-muted)">${b.tel}</small></td>
            <td>${b.deporte}</td>
            <td>${b.senaMonto ? `<span class="status-badge ${b.pagoSena.toLowerCase()}" onclick="toggleSena('${b.fireId}')" style="cursor:pointer" title="Clic para cambiar">$${b.senaMonto} ${b.pagoSena}</span>` : '—'}</td>
            <td><span class="status-badge ${b.estado.toLowerCase()}">${b.estado}</span></td>
            <td>
                <button class="actions-btn" onclick="updateStatus('${b.fireId}', 'Confirmado')" title="Confirmar">✅</button>
                <button class="actions-btn" onclick="deleteBooking('${b.fireId}')" title="Eliminar">🗑️</button>
            </td>
        </tr>
        `;
    }).join('');

    if (displayList.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color:var(--text-muted); padding: 2rem;">No hay turnos registrados aún.</td></tr>';
    }
}

function renderFullBookings() {
    const tbody = document.getElementById('full-bookings-tbody');
    if (!tbody) return;

    // Solo deportes
    const sportBookings = bookings.filter(b => b.deporte !== 'Nápoles Resto');

    tbody.innerHTML = sportBookings.map(b => {
        const sportColor = getSportColor(b.deporte);
        return `
        <tr style="background: ${sportColor}10;">
            <td style="border-left: 6px solid ${sportColor}; padding-left: 12px;"><small>${b.id || 'N/A'}</small></td>
            <td><strong>${b.nombre}</strong><br><small style="color:var(--text-muted)">${b.tel}</small></td>
            <td>${b.deporte}</td>
            <td>${b.fecha} — ${b.hora} hs</td>
            <td>${b.senaMonto ? `<span class="status-badge ${b.pagoSena.toLowerCase()}" onclick="toggleSena('${b.fireId}')" style="cursor:pointer" title="Clic para cambiar">$${b.senaMonto} ${b.pagoSena}</span>` : 'No aplica'}</td>
            <td><span class="status-badge ${b.estado.toLowerCase()}">${b.estado}</span></td>
            <td>
                <button class="actions-btn" onclick="updateStatus('${b.fireId}', 'Confirmado')" title="Confirmar">✅</button>
                <button class="actions-btn" onclick="updateStatus('${b.fireId}', 'Cancelado')" title="Cancelar">⚠️</button>
                <button class="actions-btn" onclick="deleteBooking('${b.fireId}')" title="Eliminar">🗑️</button>
            </td>
        </tr>
        `;
    }).join('');

    if (sportBookings.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; color:var(--text-muted); padding: 2rem;">No hay turnos registrados.</td></tr>';
    }
}

function renderRestoBookings() {
    const tbody = document.getElementById('resto-bookings-tbody');
    if (!tbody) return;

    const restoBookings = bookings.filter(b => b.deporte === 'Nápoles Resto');

    tbody.innerHTML = restoBookings.map(b => `
        <tr>
            <td>${b.fecha} — ${b.hora} hs</td>
            <td><strong>${b.nombre}</strong><br><small style="color:var(--text-muted)">${b.tel}</small></td>
            <td>${b.pax} comensales</td>
            <td><span class="status-badge ${b.estado.toLowerCase()}">${b.estado}</span></td>
            <td>
                <button class="actions-btn" onclick="updateStatus('${b.fireId}', 'Confirmado')" title="Confirmar">✅</button>
                <button class="actions-btn" onclick="updateStatus('${b.fireId}', 'Cancelado')" title="Cancelar">⚠️</button>
                <button class="actions-btn" onclick="deleteBooking('${b.fireId}')" title="Eliminar">🗑️</button>
            </td>
        </tr>
    `).join('');

    if (restoBookings.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color:var(--text-muted); padding: 2rem;">No hay reservas para Nápoles hoy.</td></tr>';
    }
}

function renderEvents() {
    const tbody = document.getElementById('events-tbody');
    if (!tbody) return;

    tbody.innerHTML = events.map(e => `
        <tr>
            <td style="font-size:1.4rem">${e.emoji}</td>
            <td><strong>${e.nombre}</strong></td>
            <td>${e.fecha} — ${e.hora}</td>
            <td><span style="background:rgba(201,168,76,0.1); color:var(--accent-gold); padding:0.2rem 0.6rem; border-radius:4px; font-size:0.7rem;">${e.tipo}</span></td>
            <td>
                <button class="actions-btn" onclick="deleteEvent(${e.id})">🗑️</button>
            </td>
        </tr>
    `).join('');
}

function renderOccupancy() {
    const sports = ['Pádel', 'Tenis', 'Natación', 'Fútbol', 'Colonia'];
    const counts = sports.map(s => bookings.filter(b => b.deporte === s).length);
    const max = Math.max(...counts, 10);

    const container = document.getElementById('occupancy-list');
    container.innerHTML = sports.map((s, i) => `
        <div class="bar-item">
            <div class="bar-label">
                <span>${s}</span>
                <span>${counts[i]} turnos</span>
            </div>
            <div class="bar-bg">
                <div class="bar-fill" style="width: ${(counts[i] / max) * 100}%; background: ${getSportColor(s)}"></div>
            </div>
        </div>
    `).join('');
}

function updateSidebarCounters() {
    const sports = {
        'Pádel': 'count-padel',
        'Tenis': 'count-tenis',
        'Natación': 'count-natacion',
        'Fútbol': 'count-futbol',
        'Clases de Pádel': 'count-clases-padel',
        'Clases de Tenis': 'count-clases-tenis'
    };
    Object.entries(sports).forEach(([name, id]) => {
        const count = bookings.filter(b => b.deporte === name).length;
        const el = document.getElementById(id);
        if (el) el.textContent = count;
    });

    const restoCount = bookings.filter(b => b.deporte === 'Nápoles Resto').length;
    if (document.getElementById('count-resto')) document.getElementById('count-resto').textContent = restoCount;

    const pendingCount = bookings.filter(b => b.estado === 'Pendiente').length;
    if (document.getElementById('count-turnos')) document.getElementById('count-turnos').textContent = pendingCount;
}

// ─── ACTIONS ───
function openNewEventModal() {
    document.getElementById('modal-new-event').style.display = 'flex';
}

function closeEventModal() {
    document.getElementById('modal-new-event').style.display = 'none';
}

function saveNewEvent() {
    const name = document.getElementById('ev-name').value.trim();
    const date = document.getElementById('ev-date').value.trim();
    const hour = document.getElementById('ev-hour').value.trim();
    const type = document.getElementById('ev-type').value;
    const emoji = document.getElementById('ev-emoji').value.trim() || '📅';

    if (!name || !date || !hour) {
        alert('Por favor completa los campos principales.');
        return;
    }

    const newEvent = {
        id: Date.now(),
        emoji,
        nombre: name,
        fecha: date,
        hora: hour,
        tipo: type,
        tipo_key: type.toLowerCase()
    };

    events.push(newEvent);
    localStorage.setItem('club_las_rejas_events', JSON.stringify(events));
    closeEventModal();
    initDashboard();
}

function deleteEvent(id) {
    if (!confirm('¿Seguro deseas eliminar este evento?')) return;
    events = events.filter(e => e.id !== id);
    localStorage.setItem('club_las_rejas_events', JSON.stringify(events));
    initDashboard();
}

async function deleteBooking(fireId) {
    if (!confirm('¿Seguro que deseas eliminar esta reserva?')) return;
    try {
        await deleteDoc(doc(db, "bookings", fireId));
    } catch (e) {
        console.error("Error deleting booking:", e);
    }
}

async function updateStatus(fireId, newStatus) {
    try {
        const bookingRef = doc(db, "bookings", fireId);
        await updateDoc(bookingRef, { estado: newStatus });
    } catch (e) {
        console.error("Error updating status:", e);
    }
}

async function toggleSena(fireId) {
    const b = bookings.find(x => x.fireId === fireId);
    if (b) {
        const newStatus = b.pagoSena === 'Pagado' ? 'Pendiente' : 'Pagado';
        try {
            const bookingRef = doc(db, "bookings", fireId);
            await updateDoc(bookingRef, { pagoSena: newStatus });
        } catch (e) {
            console.error("Error toggling seña:", e);
        }
    }
}

function enviarReporteDiario() {
    const todayStr = getTodayString();
    const todayBookings = bookings.filter(b => b.fecha.includes(todayStr) || b.fecha === todayStr);

    if (todayBookings.length === 0) {
        alert('No hay turnos registrados para hoy todavía.');
        return;
    }

    const sports = ['Pádel', 'Tenis', 'Natación', 'Fútbol'];
    const summaryBySport = sports.map(s => {
        const count = todayBookings.filter(b => b.deporte === s).length;
        return count > 0 ? `• ${s}: ${count} turnos` : null;
    }).filter(x => x !== null).join('\n');

    const confirmed = todayBookings.filter(b => b.estado === 'Confirmado').length;
    const pending = todayBookings.filter(b => b.estado === 'Pendiente').length;
    const canceled = todayBookings.filter(b => b.estado === 'Cancelado').length;

    const prices = { 'Pádel': 3500, 'Tenis': 3000, 'Natación': 2500, 'Fútbol': 4000 };
    const income = todayBookings.reduce((acc, b) => acc + (prices[b.deporte] || 0), 0);

    const message = `*📊 REPORTE DIARIO - CLUB LAS REJAS*
📅 Fecha: ${todayStr}

*Resumen General:*
✅ Turnos Totales: ${todayBookings.length}
💰 Ingresos Est.: $${(income / 1000).toFixed(1)}k
⌛ Pendientes: ${pending}
❌ Cancelados: ${canceled}

*Detalle por Actividad:*
${summaryBySport}

*Estado Final:* Jornada enviada desde el Panel de Gestión. ¡Buen descanso! 🏆`;

    const waLink = `https://wa.me/543834650101?text=${encodeURIComponent(message)}`;
    window.open(waLink, '_blank');
}

function exportData() {
    const todayStr = getTodayString();
    
    // Extraer solo la parte de fecha numérica (ej: "31/3") para evitar problemas si el día de la semana (Lun/Mar) no coincide
    const now = new Date();
    const numericDate = `${now.getDate()}/${now.getMonth() + 1}`;
    
    console.log("Buscando turnos para la fecha numérica:", numericDate);
    console.log("Todas las reservas actuales:", bookings);

    const todayBookings = bookings.filter(b => {
        // Buscamos coincidencias tanto en el formato largo como si contiene la fecha numérica
        return b.fecha === todayStr || b.fecha.includes(numericDate);
    });

    if (todayBookings.length === 0) {
        alert('No se encontraron turnos en la base de datos para hoy (' + numericDate + ').\n\nVerifica que la fecha de los turnos coincida con el día actual.');
        return;
    }

    // Definir cabeceras personalizadas
    const headers = ['Nombre', 'Fecha', 'Hora', 'Actividad', 'Metodo de Pago'];
    
    // Mapear datos
    const rows = todayBookings.map(b => [
        `"${b.nombre.replace(/"/g, '""')}"`,
        `"${b.fecha}"`,
        `"${b.hora}"`,
        `"${b.deporte}"`,
        `"${b.metodoPago || 'N/A'}"`
    ]);

    // Combinar todo en un string CSV usando punto y coma
    const csvContent = [headers, ...rows].map(e => e.join(";")).join("\n");
    
    const blob = new Blob(["\ufeff" + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement("a");
    link.setAttribute("href", url);
    const fileName = `turnos_${numericDate.replace(/\//g, '-')}.csv`;
    link.setAttribute("download", fileName);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

// ─── HELPERS ───
function getTodayString() {
    const now = new Date();
    const daysArr = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
    return `${daysArr[now.getDay()]} ${now.getDate()}/${now.getMonth() + 1}`;
}

function getSportColor(sport) {
    const s = sport.toLowerCase();
    // Colores más vibrantes y neón para mayor diferenciación
    if (s.includes('pádel')) return '#00d2ff'; // Celeste Eléctrico
    if (s.includes('tenis')) return '#ccff00'; // Verde Neón (Pelota de tenis)
    if (s.includes('fútbol')) return '#ff3838'; // Rojo Intenso
    if (s.includes('natación')) return '#00ffcc'; // Turquesa Neón
    if (s.includes('nápoles')) return '#ff9f43'; // Naranja Brillante
    if (s.includes('colonia')) return '#f368e0'; // Rosa / Violeta
    return '#ffffff';
}

// ─── INIT ───
// onAuthStateChanged se encarga de llamar a initDashboard


function navigateTo(sectionId, title = null) {
    // Ocultar todas las secciones
    document.querySelectorAll('.admin-section').forEach(s => s.style.display = 'none');

    // Mostrar la seleccionada
    const target = document.getElementById(sectionId);
    if (target) {
        target.style.display = 'block';
        if (title && document.getElementById('placeholder-title')) {
            document.getElementById('placeholder-title').textContent = `Sección: ${title}`;
        }
    }

    // Actualizar estado activo en sidebar
    document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
    const activeLink = document.querySelector(`[data-nav="${sectionId}"]`);
    if (activeLink) activeLink.classList.add('active');
}

// ─── LIMPIEZA AUTOMÁTICA (7 DÍAS) ───
async function cleanupOldBookings() {
    console.log("Iniciando limpieza de turnos viejos...");
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    
    // Convertir a Timestamp de Firestore
    const tsLimit = Timestamp.fromDate(sevenDaysAgo);
    
    const q = query(collection(db, "bookings"), where("timestamp", "<", tsLimit));
    
    try {
        const snapshot = await getDocs(q);
        if (snapshot.empty) {
            console.log("No hay turnos viejos para limpiar.");
            return;
        }
        
        let deletedCount = 0;
        const promises = snapshot.docs.map(d => {
            deletedCount++;
            return deleteDoc(doc(db, "bookings", d.id));
        });
        
        await Promise.all(promises);
        console.log(`Limpieza completada: ${deletedCount} turnos eliminados.`);
    } catch (e) {
        console.error("Error en limpieza:", e);
    }
}

// ─── MÓDULO: REPORTES ───
function renderReports() {
    const revenueEl = document.getElementById('report-total-revenue');
    const avgTicketEl = document.getElementById('report-avg-ticket');
    const confirmedEl = document.getElementById('report-total-confirmed');
    const topSportEl = document.getElementById('report-top-sport');
    const tbody = document.getElementById('report-tbody');
    
    if (!revenueEl || !tbody) return;

    // Solo turnos de hoy para el reporte diario
    const todayStr = getTodayString();
    const todayNum = todayStr.split(' ')[1];
    const todayBookings = bookings.filter(b => b.fecha.includes(todayNum));

    const totalRevenue = todayBookings.filter(b => b.pagoSena === 'Pagado').reduce((acc, b) => acc + (b.senaMonto || 0), 0);
    const confirmedCount = todayBookings.filter(b => b.estado === 'Confirmado').length;
    const avgTicket = todayBookings.length > 0 ? (totalRevenue / todayBookings.length) : 0;

    revenueEl.textContent = `$${totalRevenue.toLocaleString('es-AR')}`;
    avgTicketEl.textContent = `$${avgTicket.toLocaleString('es-AR', { maximumFractionDigits: 0 })}`;
    confirmedEl.textContent = confirmedCount;

    // Resumen por deporte
    const sportStats = {};
    todayBookings.forEach(b => {
        if (!sportStats[b.deporte]) sportStats[b.deporte] = { count: 0, revenue: 0 };
        sportStats[b.deporte].count++;
        if (b.pagoSena === 'Pagado') sportStats[b.deporte].revenue += (b.senaMonto || 0);
    });

    let topSport = '-';
    let maxCount = 0;
    
    tbody.innerHTML = Object.keys(sportStats).map(sport => {
        if (sportStats[sport].count > maxCount) {
            maxCount = sportStats[sport].count;
            topSport = sport;
        }
        return `
            <tr>
                <td><strong>${sport}</strong></td>
                <td>${sportStats[sport].count} turnos</td>
                <td>$${sportStats[sport].revenue.toLocaleString('es-AR')}</td>
            </tr>
        `;
    }).join('');

    topSportEl.textContent = topSport;
    
    // Actualizar Gráficos
    updateCharts(sportStats);
}

function updateCharts(sportData) {
    const ctxSports = document.getElementById('sportsChart');
    if (!ctxSports) return;

    const labels = Object.keys(sportData);
    const counts = labels.map(l => sportData[l].count);
    const bgColors = labels.map(l => getSportColor(l));

    if (sportsChart) {
        sportsChart.data.labels = labels;
        sportsChart.data.datasets[0].data = counts;
        sportsChart.data.datasets[0].backgroundColor = bgColors;
        sportsChart.update();
    } else {
        sportsChart = new Chart(ctxSports, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Turnos Hoy',
                    data: counts,
                    backgroundColor: bgColors,
                    borderRadius: 8
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false }
                },
                scales: {
                    y: { beginAtZero: true, grid: { color: 'rgba(255,255,255,0.05)' } },
                    x: { grid: { display: false } }
                }
            }
        });
    }
}

// ─── MÓDULO: COLONIA ───
function renderColonia() {
    const tbody = document.getElementById('colonia-tbody');
    if (!tbody) return;

    tbody.innerHTML = inscriptions.map(i => `
        <tr>
            <td><strong>${i.nombreNino}</strong></td>
            <td>${i.dni}</td>
            <td>${i.edad} años</td>
            <td>${i.nombrePadre}</td>
            <td>${i.whatsapp}</td>
            <td>
                <a href="https://wa.me/${i.whatsapp}" target="_blank" class="actions-btn" title="Chatear">💬</a>
                <button class="actions-btn" onclick="deleteInscription('${i.fireId}')" title="Eliminar">🗑️</button>
            </td>
        </tr>
    `).join('');
}

async function deleteInscription(id) {
    if (!confirm('¿Seguro deseas eliminar esta inscripción?')) return;
    await deleteDoc(doc(db, "inscriptions", id));
}

// ─── MÓDULO: BLOQUEOS ───
function renderBlocks() {
    const tbody = document.getElementById('blocks-tbody');
    if (!tbody) return;

    tbody.innerHTML = blocks.map(bl => `
        <tr>
            <td><span class="status-badge" style="background: var(--accent-gold); color: black;">${bl.deporte}</span></td>
            <td>${bl.fecha} — ${bl.hora} hs</td>
            <td>
                <button class="actions-btn" onclick="deleteBlock('${bl.fireId}')" title="Eliminar">🗑️</button>
            </td>
        </tr>
    `).join('');
}

async function saveNewBlock() {
    const deporte = document.getElementById('bl-sport').value;
    const fecha = document.getElementById('bl-date').value.trim();
    const hora = document.getElementById('bl-hour').value.trim();

    if (!fecha || !hora) {
        alert('Completa fecha y hora para el bloqueo.');
        return;
    }

    try {
        await addDoc(collection(db, "blocks"), {
            deporte,
            fecha,
            hora,
            timestamp: new Date()
        });
        alert('Horario bloqueado con éxito.');
    } catch (e) {
        console.error("Error saving block:", e);
    }
}

async function deleteBlock(id) {
    if (!confirm('¿Eliminar este bloqueo?')) return;
    await deleteDoc(doc(db, "blocks", id));
}

// ─── MÓDULO: SECCIONES POR DEPORTE ───
function renderSportBookings(sport, tbodyId) {
    const tbody = document.getElementById(tbodyId);
    if (!tbody) return;

    const filtered = bookings.filter(b => b.deporte === sport);

    tbody.innerHTML = filtered.map(b => `
        <tr style="border-left: 5px solid ${getSportColor(b.deporte)}; background: ${getSportColor(b.deporte)}11;">
            <td><strong>${b.nombre}</strong></td>
            <td>${b.fecha} — ${b.hora} hs</td>
            <td><span class="status-badge ${b.estado.toLowerCase()}">${b.estado}</span></td>
            <td>
                <button class="actions-btn" onclick="updateStatus('${b.fireId}', 'Confirmado')" title="Confirmar">✅</button>
                <button class="actions-btn" onclick="deleteBooking('${b.fireId}')" title="Eliminar">🗑️</button>
            </td>
        </tr>
    `).join('');
}

// ─── MÓDULO: CALENDARIO ADMINISTRATIVO ───
function renderAdminCalendar() {
    const grid = document.getElementById('admin-calendar-grid');
    const sportFilter = document.getElementById('cal-sport-filter');
    if (!grid || !sportFilter) return;

    const selectedSport = sportFilter.value;
    grid.innerHTML = '';

    availabilityHours.forEach(hour => {
        // Etiqueta de la hora
        const timeLabel = document.createElement('div');
        timeLabel.className = 'cal-time-label';
        timeLabel.textContent = hour;
        grid.appendChild(timeLabel);

        // Slots por cada día
        calendarDays.forEach(day => {
            const slotEl = document.createElement('div');
            
            // Buscar todas las reservas para este slot (deporte, día, hora)
            const slotBookings = bookings.filter(b => 
                b.deporte === selectedSport && 
                b.fecha === day && 
                b.hora === hour &&
                b.estado !== 'Cancelado'
            );

            // Buscar si hay un bloqueo
            const isBlocked = blocks.some(bl => 
                (bl.deporte === 'Todos' || bl.deporte === selectedSport) &&
                bl.fecha === day &&
                bl.hora === hour
            );

            const totalCourts = courtCounts[selectedSport] || 1;
            const occupiedCount = slotBookings.length;

            if (isBlocked) {
                slotEl.className = 'cal-slot-admin ocupado';
                slotEl.style.background = '#f39c1233';
                slotEl.style.color = '#d35400';
                slotEl.style.borderColor = '#e67e2244';
                slotEl.innerHTML = '<span>Bloqueado</span>';
                slotEl.onclick = () => alert(`⚙️ Horario bloqueado por el administrador.`);
            } else if (occupiedCount >= totalCourts) {
                // TODO OCUPADO
                slotEl.className = 'cal-slot-admin ocupado';
                const mainName = slotBookings[0].nombre.split(' ')[0].substring(0, 8);
                slotEl.innerHTML = `<span style="font-size: 0.65rem; line-height: 1.1;">Full (${occupiedCount}/${totalCourts})<br>👤 ${mainName}</span>`;
                slotEl.title = `Completo. Clientes: ${slotBookings.map(b => b.nombre).join(', ')}`;
                slotEl.onclick = () => {
                    let msg = `📌 Slot Completo para ${selectedSport} (${occupiedCount}/${totalCourts})\n\n`;
                    slotBookings.forEach((b, idx) => {
                        msg += `👤 Cancha ${idx+1}: ${b.nombre} (${b.whatsapp})\n`;
                    });
                    alert(msg);
                };
            } else if (occupiedCount > 0) {
                // ALGUNAS LIBRES, ALGUNAS OCUPADAS
                slotEl.className = 'cal-slot-admin libre'; // Mostramos como libre porque aún hay canchas
                slotEl.style.background = '#e8f5e9'; // Verde suave
                slotEl.style.border = '2px dashed #b7e4c7';
                const mainName = slotBookings[0].nombre.split(' ')[0].substring(0, 8);
                slotEl.innerHTML = `<span style="font-size: 0.65rem; color: #2d6a4f;">${occupiedCount}/${totalCourts} Ocup.<br>👤 ${mainName}</span>`;
                slotEl.onclick = () => {
                    let msg = `📌 Ocupación Parcial en ${selectedSport} (${occupiedCount}/${totalCourts} canchas)\n\n`;
                    slotBookings.forEach((b, idx) => {
                        msg += `👤 Cancha ${idx+1}: ${b.nombre} (${b.whatsapp})\n`;
                    });
                    msg += `\n✅ Todavía hay ${totalCourts - occupiedCount} cancha(s) disponible(s).`;
                    alert(msg);
                };
            } else {
                // TOTALMENTE LIBRE
                slotEl.className = 'cal-slot-admin libre';
                slotEl.innerHTML = `<span>Libre<br><small style="opacity:0.6">${totalCourts} canch.</small></span>`;
            }

            grid.appendChild(slotEl);
        });
    });
}

// ─── MÓDULO: NOTIFICACIONES (GESTIÓN DE APROBACIONES) ───
function renderNotifications() {
    const list = document.getElementById('notifications-list');
    const badge = document.getElementById('notif-count');
    if (!list) return;

    // Solo mostramos los turnos con estado 'Pendiente'
    const pending = bookings.filter(b => b.estado === 'Pendiente');
    
    // Actualizar el número de la burbuja roja
    if (badge) {
        badge.textContent = pending.length;
        badge.parentElement.style.opacity = pending.length > 0 ? "1" : "0.5";
    }

    if (pending.length === 0) {
        list.innerHTML = `
            <div style="text-align: center; padding: 2rem; color: var(--text-muted); border: 2px dashed var(--border); border-radius: 12px;">
                <p>✅ Todos los turnos han sido procesados. <br> No hay aprobaciones pendientes.</p>
            </div>
        `;
        return;
    }

    list.innerHTML = pending.map(b => {
        // Formatear la hora de creación desde el timestamp
        let createdTime = "";
        if (b.timestamp && b.timestamp.toDate) {
            const date = b.timestamp.toDate();
            createdTime = date.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }) + ' hs';
        }

        return `
            <div class="stat-card" style="display: flex; align-items: center; justify-content: space-between; padding: 1.2rem; margin-bottom: 0px; border-left: 5px solid ${getSportColor(b.deporte)};">
                <div style="display: flex; align-items: center; gap: 1.2rem;">
                    <div style="font-size: 1.8rem;">📥</div>
                    <div>
                        <h4 style="margin:0; font-size: 0.95rem; color: var(--accent-gold);">Nueva Solicitud: ${b.deporte} <span style="font-size: 0.7rem; color: var(--text-muted); font-weight: 400; margin-left: 5px;">(${createdTime})</span></h4>
                        <p style="margin:0; font-size: 0.85rem; color: white;"><strong>${b.nombre}</strong> — ${b.whatsapp || 'Sin Tel.'}</p>
                        <p style="margin:0.2rem 0 0; font-size: 0.8rem; color: var(--text-muted);">⏱️ Turno: ${b.fecha} - ${b.hora} hs</p>
                    </div>
                </div>
                <div style="display: flex; gap: 0.8rem;">
                    <button class="btn-primary" onclick="updateStatus('${b.fireId}', 'Confirmado')" style="height: 40px; padding: 0 1rem; font-size: 0.75rem;">Aprobar ✅</button>
                    <button class="actions-btn" onclick="navigateTo('section-turnos')" title="Ver en tabla">👁️</button>
                </div>
            </div>
        `;
    }).join('');
}

// ─── EXPOSICIÓN GLOBAL ───
window.login = login;
window.logout = logout;
window.navigateTo = navigateTo;
window.enviarReporteDiario = enviarReporteDiario;
window.exportData = exportData;
window.deleteBooking = deleteBooking;
window.updateStatus = updateStatus;
window.toggleSena = toggleSena;
window.saveNewBlock = saveNewBlock;
window.deleteBlock = deleteBlock;
window.deleteInscription = deleteInscription;
window.renderAdminCalendar = renderAdminCalendar;
