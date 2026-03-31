import { db } from './firebase.js';
import { collection, addDoc, serverTimestamp, onSnapshot, query, orderBy } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// ─── VARIABLES GLOBALES ───
let selectedSport = 'padel';
let selectedSlot = null;
let selectedColoniaTurno = null;
let blocks = [];

const formatCurrency = (val) => {
    return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 0 }).format(val);
};

// ─── CONFIGURACIÓN DE DEPORTES ───
const sportInfo = {
    padel: {
        title: '🎾 Pádel — Las Rejas Tennis Club',
        desc: '4 canchas disponibles (1 techada). Homologadas internacionalmente.',
        price: 45000
    },
    tenis: {
        title: '🎾 Tenis — Las Rejas Tennis Club',
        desc: 'Canchas de tenis en perfectas condiciones.',
        price: 30000
    },
    natacion: {
        title: '🏊 Natación — Colonia Las Rejas',
        desc: 'Clases de natación para niños y adultos. Todos los niveles.',
        price: 25000
    },
    futbol: {
        title: '⚽ Fútbol — Las Rejas Club',
        desc: 'Cancha de fútbol disponible para reserva. Ideal para picados.',
        price: 4000
    },
    napoles: {
        title: '🍕 Nápoles Resto — Las Rejas',
        desc: 'Restaurante y bar de primer nivel. Reserva tu mesa aquí.',
        price: 0
    },
    clases_padel: {
        title: '🎾 Clases de Pádel — Las Rejas',
        desc: 'Mejorá tu técnica con nuestros profesores.',
        price: 5000
    },
    clases_tenis: {
        title: '🎾 Clases de Tenis — Las Rejas',
        desc: 'Entrenamiento guiado para adultos y niños.',
        price: 4500
    }
};

// Disponibilidad simulada
const availability = {
    '8:00': [1, 1, 0, 1, 0, 1, 1],
    '9:00': [0, 1, 1, 0, 1, 1, 0],
    '10:00': [1, 0, 0, 1, 1, 0, 1],
    '11:00': [1, 1, 1, 0, 0, 1, 1],
    '14:00': [0, 0, 1, 1, 1, 0, 1],
    '15:00': [1, 1, 0, 0, 1, 1, 0],
    '16:00': [1, 0, 1, 1, 0, 0, 1],
    '17:00': [0, 1, 1, 0, 1, 1, 1],
    '18:00': [1, 1, 0, 1, 1, 0, 0],
    '19:00': [0, 0, 1, 1, 0, 1, 1],
    '20:00': [1, 1, 1, 0, 1, 0, 1],
    '21:00': [0, 1, 0, 1, 1, 1, 0],
};

// Sincronización de bloqueos
onSnapshot(query(collection(db, "blocks")), (snapshot) => {
    blocks = snapshot.docs.map(doc => doc.data());
    buildCalendar(); // Refrescar calendario cuando hay nuevos bloqueos
});

const days = ['Lun 31/3', 'Mar 1/4', 'Mié 2/4', 'Jue 3/4', 'Vie 4/4', 'Sáb 5/4', 'Dom 6/4'];
const shortDays = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

function buildCalendar() {
    const container = document.getElementById('calendar');
    if (!container) return;
    container.innerHTML = '';
    
    // Mapeo de nombres para normalizar deporte seleccionado vs nombre en bloqueos
    const sportNameMap = {
        'padel': 'Pádel',
        'tenis': 'Tenis',
        'natacion': 'Natación',
        'futbol': 'Fútbol',
        'clases_padel': 'Pádel',
        'clases_tenis': 'Tenis'
    };

    Object.entries(availability).forEach(([time, slots]) => {
        const timeEl = document.createElement('div');
        timeEl.className = 'cal-time';
        timeEl.textContent = time;
        container.appendChild(timeEl);
        
        slots.forEach((libre, i) => {
            const dayStr = days[i];
            
            // Verificar si este slot está bloqueado por el admin
            const isBlocked = blocks.some(b => {
                const matchTime = b.hora === time;
                const matchDay = b.fecha === dayStr;
                const matchSport = b.deporte === 'Todos' || b.deporte === sportNameMap[selectedSport];
                return matchTime && matchDay && matchSport;
            });

            const finalLibre = libre && !isBlocked;

            const slot = document.createElement('div');
            slot.className = `cal-slot ${finalLibre ? 'libre' : 'ocupado'}`;
            slot.textContent = finalLibre ? 'Libre' : (isBlocked ? 'No Disp.' : 'Ocupado');
            
            if (finalLibre) {
                slot.onclick = () => selectSlot(slot, time, dayStr);
            }
            container.appendChild(slot);
        });
    });
}

function selectSlot(el, time, day) {
    document.querySelectorAll('.cal-slot.seleccionado').forEach(s => {
        s.classList.remove('seleccionado');
        s.classList.add('libre');
        s.textContent = 'Libre';
    });
    el.classList.remove('libre');
    el.classList.add('seleccionado');
    el.textContent = '⭐';
    selectedSlot = { time, day };

    const sport = sportInfo[selectedSport];
    document.getElementById('selected-slot-info').textContent = `📅 ${day} a las ${time} hs — ${sport.title.split('—')[0].trim()}`;

    const form = document.getElementById('booking-form');
    form.style.display = 'block';

    updatePaymentUI();

    const extraInfo = document.getElementById('booking-extra-info') || document.createElement('div');
    extraInfo.id = 'booking-extra-info';
    if (selectedSport === 'napoles') {
        extraInfo.innerHTML = `
            <div style="margin-top:1rem;">
                <label style="display:block; font-size:0.8rem; margin-bottom:0.4rem; color:var(--dorado);">Personas / Comensales:</label>
                <input type="number" id="f-pax" value="2" min="1" max="20" style="background:rgba(255,255,255,0.05); border:1px solid rgba(201,168,76,0.2); color:white; padding:0.6rem; border-radius:6px; width:100%;">
            </div>
        `;
    } else {
        extraInfo.innerHTML = '';
    }
    if (!document.getElementById('booking-extra-info')) {
        form.insertBefore(extraInfo, document.querySelector('button[onclick="confirmarReserva()"]'));
    }

    form.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function updatePaymentUI() {
    const paymentSection = document.getElementById('payment-section');
    if (!paymentSection || !selectedSlot) return;

    const sport = sportInfo[selectedSport];
    if (selectedSport !== 'napoles') {
        const total = sport.price;
        const sena = total * 0.3;
        const saldo = total - sena;

        // Mantener el método seleccionado si ya existe
        const currentMethod = document.querySelector('input[name="p-metodo"]:checked')?.value || 'Transferencia';

        paymentSection.innerHTML = `
            <div class="payment-calc">
                <div class="calc-item"><span>Total:</span> <span>${formatCurrency(total)}</span></div>
                <div class="calc-item highlight"><span>Seña (30%):</span> <span>${formatCurrency(sena)}</span></div>
                <div class="calc-item"><span>Saldo en el club:</span> <span>${formatCurrency(saldo)}</span></div>
            </div>
            <div class="payment-methods">
                <p>Elegí cómo abonar la seña:</p>
                <div class="methods-grid">
                    <label class="method-card">
                        <input type="radio" name="p-metodo" value="Transferencia" ${currentMethod === 'Transferencia' ? 'checked' : ''} onchange="togglePaymentDetails('transfer')">
                        <div class="method-content">
                            <span class="method-icon">🏦</span>
                            <span class="method-name">Transferencia</span>
                        </div>
                    </label>
                    <label class="method-card">
                        <input type="radio" name="p-metodo" value="Mercado Pago" ${currentMethod === 'Mercado Pago' ? 'checked' : ''} onchange="togglePaymentDetails('mp')">
                        <div class="method-content">
                            <span class="method-icon">💳</span>
                            <span class="method-name">Mercado Pago</span>
                        </div>
                    </label>
                </div>
                <div id="transfer-details" class="payment-info-box" style="display: ${currentMethod === 'Transferencia' ? 'block' : 'none'};">
                    <p>🏦 <strong>Datos para la transferencia:</strong></p>
                    <p>Alias: <strong>san.mezza</strong></p>
                    <p>Banco: Mercado Pago / Santander</p>
                    <p style="font-size:0.75rem; margin-top:0.5rem; opacity:0.8;">Por favor, enviá el comprobante por WhatsApp al finalizar.</p>
                </div>
                <div id="mp-details" class="payment-info-box" style="display: ${currentMethod === 'Mercado Pago' ? 'block' : 'none'};">
                    <p>💳 <strong>Pago por Mercado Pago:</strong></p>
                    <a href="https://link.mercadopago.com.ar/lasrejasctaoooo" target="_blank" class="mp-btn-link">Pagar Seña ${formatCurrency(sena)} →</a>
                    <p style="font-size:0.75rem; margin-top:0.5rem; opacity:0.8;">El pago se acredita instantáneamente.</p>
                </div>
            </div>
        `;
        paymentSection.style.display = 'block';
    } else {
        paymentSection.style.display = 'none';
        paymentSection.innerHTML = '';
    }
}

function togglePaymentDetails(type) {
    document.getElementById('transfer-details').style.display = type === 'transfer' ? 'block' : 'none';
    document.getElementById('mp-details').style.display = type === 'mp' ? 'block' : 'none';
}

function selectSport(btn, sport) {
    document.querySelectorAll('.sport-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    selectedSport = sport;
    document.getElementById('sport-title').textContent = sportInfo[sport].title;
    document.getElementById('sport-desc-txt').textContent = sportInfo[sport].desc;
    selectedSlot = null;
    document.getElementById('booking-form').style.display = 'none';
    buildCalendar();
}

function scrollToTurnos(sport) {
    document.getElementById('turnos').scrollIntoView({ behavior: 'smooth' });
    setTimeout(() => {
        const btn = document.querySelector(`.sport-btn[onclick*="${sport}"]`);
        if (btn) btn.click();
    }, 600);
}

async function confirmarReserva() {
    console.log("Iniciando proceso de reserva...");
    
    const nombreInput = document.getElementById('f-nombre');
    const telInput = document.getElementById('f-tel');
    
    if (!nombreInput || !telInput) {
        console.error("No se encontraron los campos del formulario.");
        return;
    }

    const nombre = nombreInput.value.trim();
    const tel = telInput.value.trim();

    if (!nombre || !tel) { 
        showToast('⚠️ Completá nombre y WhatsApp'); 
        return; 
    }
    
    if (!selectedSlot) { 
        showToast('⚠️ Seleccioná un horario del calendario'); 
        return; 
    }

    try {
        const sport = sportInfo[selectedSport];
        const deporte = sport.title.split('—')[0].trim();
        
        // Obtener PAX (puede ser de f-pax para Nápoles o f-jugadores para deportes)
        let pax = null;
        const paxInput = document.getElementById('f-pax');
        const jugadoresInput = document.getElementById('f-jugadores');
        
        if (paxInput) pax = paxInput.value;
        else if (jugadoresInput) pax = jugadoresInput.value;

        // Datos de pago
        let metodoPago = null;
        let senaMonto = 0;
        if (selectedSport !== 'napoles') {
            const metodos = document.getElementsByName('p-metodo');
            for (const m of metodos) if (m.checked) metodoPago = m.value;
            senaMonto = sport.price * 0.3;
        }

        // Crear y guardar la reserva
        const id = 'RES-' + Date.now().toString(36).toUpperCase();
        const reserva = {
            id,
            nombre,
            tel,
            deporte,
            fecha: selectedSlot.day,
            hora: selectedSlot.time,
            pax: pax,
            metodoPago: metodoPago,
            senaMonto: senaMonto,
            pagoSena: 'Pendiente',
            estado: 'Pendiente',
            timestamp: serverTimestamp()
        };

        console.log("Intentando guardar en Firebase:", reserva);
        await addDoc(collection(db, "bookings"), reserva);
        
        const waText = encodeURIComponent(`Hola! Quiero informar mi reserva:
📅 ${selectedSlot.day} - ${selectedSlot.time} hs
🎾 ${deporte}
👤 ${nombre}
💰 Seña: ${formatCurrency(senaMonto)} (${metodoPago || 'No requiere'})
${metodoPago === 'Transferencia' ? '🏦 Ya realicé la transferencia (adjunto comprobante).' : ''}
ID: ${id}`);

        const waLink = `https://wa.me/543834650101?text=${waText}`;
        
        // Abrir WhatsApp automáticamente después de guardar
        window.open(waLink, '_blank');
        
        // Actualizar datos del modal por si el usuario lo ve
        const detail = document.getElementById('modal-detail');
        if (detail) {
            detail.innerHTML = `
                <p>👤 <strong>Nombre:</strong> ${nombre}</p>
                <p>📅 <strong>Fecha:</strong> ${selectedSlot.day}</p>
                <p>🕐 <strong>Horario:</strong> ${selectedSlot.time} hs</p>
                <p>🏠 <strong>Actividad:</strong> ${deporte} ${pax ? `(${pax})` : ''}</p>
                ${metodoPago ? `<p>💳 <strong>Seña:</strong> ${formatCurrency(senaMonto)} (${metodoPago})</p>` : ''}
                <p>📞 <strong>WhatsApp:</strong> ${tel}</p>
                <p style="font-size:0.8rem; color:var(--gris); margin-top:0.5rem;">ID de Reserva: ${id}</p>
            `;
        }

        const waBtn = document.getElementById('modal-wa');
        if (waBtn) waBtn.href = waLink;
        
        const modal = document.getElementById('modal-reserva');
        if (modal) modal.classList.add('show');


    } catch (e) {
        console.error("Error en confirmarReserva:", e);
        showToast('❌ Error al guardar reserva. Revisa la consola.');
    }
}

function saveBooking(reserva) {
    // Esta función ya no se usa, el guardado es asíncrono en confirmarReserva
}

function openEventModal(title, date, type) {
    const icons = { sunset: '🌅', fiesta: '🎊', torneo: '🏆' };
    const msgs = {
        sunset: 'Entradas limitadas. No te pierdas el mejor atardecer de Catamarca con música en vivo y gastronomía de primer nivel.',
        fiesta: 'Una noche especial en las instalaciones del club. Vestimenta formal. Plazas limitadas.',
        torneo: 'Inscripción abierta. Categorías: 1ra, 2da y 3ra. Premios para todos los clasificados.'
    };
    document.getElementById('ev-icon').textContent = icons[type];
    document.getElementById('ev-title').textContent = title;
    document.getElementById('ev-date-txt').textContent = date;
    document.getElementById('ev-msg').textContent = msgs[type];
    const waText = encodeURIComponent(`Hola! Quisiera información sobre el evento: ${title} (${date}) en Club Las Rejas. ¡Gracias!`);
    document.getElementById('ev-wa').href = `https://wa.me/543834650101?text=${waText}`;
    document.getElementById('modal-evento').classList.add('show');
}

function selectTurno(el, turno) {
    document.querySelectorAll('.turno-option').forEach(t => t.classList.remove('selected'));
    el.classList.add('selected');
    selectedColoniaTurno = turno;
}

function inscribirColonia() {
    const turno = selectedColoniaTurno || 'mañana';
    const turnos = { mañana: '10:00 a 13:00 hs', siesta: '15:00 a 18:00 hs', tarde: '18:00 a 21:00 hs' };
    const waText = encodeURIComponent(`Hola! Quisiera inscribir a mi hijo/a en la Colonia de Verano de Las Rejas.\nTurno preferido: ${turno.charAt(0).toUpperCase() + turno.slice(1)} (${turnos[turno]})\n¿Podrían darme más información? ¡Gracias!`);
    window.open(`https://wa.me/543834650101?text=${waText}`, '_blank');
}

function closeModal(id) {
    document.getElementById(id).classList.remove('show');
}

function showToast(msg) {
    const t = document.getElementById('toast');
    if (!t) return;
    t.textContent = msg;
    t.classList.add('show');
    setTimeout(() => t.classList.remove('show'), 3500);
}

function toggleMenu() {
    const navLinks = document.querySelector('.nav-links');
    const hamburger = document.querySelector('.hamburger');
    navLinks.classList.toggle('active');
    hamburger.classList.toggle('active');
}

// Cerrar menú al elegir sección
document.querySelectorAll('.nav-links a').forEach(link => {
    link.addEventListener('click', () => {
        document.querySelector('.nav-links').classList.remove('active');
        document.querySelector('.hamburger').classList.remove('active');
    });
});

// ─── EVENTOS Y CARTA ───
const menuData = [
    {
        cat: 'Entradas', items: [
            { name: 'Bruschettas Salteñas', desc: 'Pan de masamadre, tomates confitados y albahaca.', price: '$1.800' },
            { name: 'Empanadas de Carne', desc: 'Tradicionales de Catamarca, fritas o al horno.', price: '$1.200 c/u' }
        ]
    },
    {
        cat: 'Platos Principales', items: [
            { name: 'Ojo de Bife Rejas', desc: 'Acompañado de papas rústicas y chimichurri.', price: '$6.500' },
            { name: 'Risotto de Hongos', desc: 'Arroz carnaroli con variedad de setas locales.', price: '$5.200' },
            { name: 'Pasta al Huevo', desc: 'Fetuccini casero con salsa pomodoro.', price: '$4.500' }
        ]
    },
    {
        cat: 'Coctelería', items: [
            { name: 'Gin Tonic de la Casa', desc: 'Gin premium con botánicos de montaña.', price: '$2.800' },
            { name: 'Negroni Clásico', desc: 'Gin, Vermouth Rosso y Campari.', price: '$3.000' }
        ]
    }
];


function initData() {
    if (!localStorage.getItem('club_las_rejas_events')) {
        const defaultEvents = [
            { id: 1, emoji: '🌅', nombre: 'Sunset Las Rejas', fecha: 'Sáb 12 de Abril', hora: '18:00 hs', tipo: 'Evento', tipo_key: 'sunset' },
            { id: 2, emoji: '🏆', nombre: 'Torneo Interno Pádel', fecha: 'Sáb 19 de Abril', hora: '09:00 hs', tipo: 'Torneo', tipo_key: 'torneo' },
            { id: 3, emoji: '🎊', nombre: 'Noche de Gala', fecha: 'Vie 25 de Abril', hora: '21:00 hs', tipo: 'Fiesta', tipo_key: 'fiesta' },
            { id: 4, emoji: '🎾', nombre: 'Torneo Tenis Dobles', fecha: 'Sáb 3 de Mayo', hora: '10:00 hs', tipo: 'Torneo', tipo_key: 'torneo' },
        ];
        localStorage.setItem('club_las_rejas_events', JSON.stringify(defaultEvents));
    }
}


function openCarta() {
    const body = document.getElementById('carta-body');
    body.innerHTML = menuData.map(c => `
        <div style="margin-bottom:2.5rem;">
            <h3 style="color:var(--dorado); border-bottom:1px solid rgba(201,168,76,0.2); padding-bottom:0.5rem; margin-bottom:1.5rem; font-family:'Playfair Display', serif;">${c.cat}</h3>
            ${c.items.map(i => `
                <div style="display:flex; justify-content:space-between; margin-bottom:1.2rem; gap:1rem;">
                    <div>
                        <div style="font-weight:600; color:white;">${i.name}</div>
                        <div style="font-size:0.85rem; color:var(--text-muted); margin-top:0.2rem;">${i.desc}</div>
                    </div>
                    <div style="font-weight:700; color:var(--dorado); white-space:nowrap;">${i.price}</div>
                </div>
            `).join('')}
        </div>
    `).join('');
    document.getElementById('modal-carta').classList.add('show');
}


function buildEventosList() {
    const eventosList = document.getElementById('eventos-list');
    if (!eventosList) return;

    const eventos = JSON.parse(localStorage.getItem('club_las_rejas_events')) || [];

    eventosList.innerHTML = eventos.map(e => `
<div onclick="openEventModal('${e.nombre}', '${e.fecha} · ${e.hora}', '${e.tipo_key}')" style="display:flex; align-items:center; gap:1.2rem; padding:1rem; border-radius:8px; cursor:pointer; transition:background 0.2s; margin-bottom:0.5rem;" onmouseover="this.style.background='rgba(255,255,255,0.08)'" onmouseout="this.style.background='transparent'">
  <span style="font-size:1.6rem">${e.emoji}</span>
  <div style="flex:1;">
    <div style="color:white; font-weight:600; font-size:0.95rem;">${e.nombre}</div>
    <div style="color:rgba(245,240,232,0.5); font-size:0.8rem;">${e.fecha} · ${e.hora}</div>
  </div>
  <span style="background:rgba(201,168,76,0.2); color:var(--dorado); font-size:0.7rem; font-weight:700; padding:0.25rem 0.7rem; border-radius:100px; letter-spacing:0.05em;">${e.tipo}</span>
  <span style="color:rgba(245,240,232,0.4); font-size:0.8rem;">→</span>
</div>
`).join('');
}

// Init
document.addEventListener('DOMContentLoaded', () => {
    initData();
    buildCalendar();
    buildEventosList();

    // Intersection observer para fade-in
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('visible');
            }
        });
    }, { threshold: 0.1 });

    document.querySelectorAll('.fade-in').forEach(el => observer.observe(el));

    // Cierre de modales al hacer click fuera
    document.querySelectorAll('.modal-overlay').forEach(overlay => {
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) overlay.classList.remove('show');
        });
    });

    // Escuchar cambios en jugadores para recalcular (si fuera necesario en el futuro)
    const selectJugadores = document.getElementById('f-jugadores');
    if (selectJugadores) {
        selectJugadores.addEventListener('change', updatePaymentUI);
    }
});

// ─── EXPOSICIÓN GLOBAL ───
window.selectSport = selectSport;
window.confirmarReserva = confirmarReserva;
window.scrollToTurnos = scrollToTurnos;
window.openCarta = openCarta;
window.openEventModal = openEventModal;
window.selectTurno = selectTurno;
window.inscribirColonia = inscribirColonia;
window.closeModal = closeModal;
window.toggleMenu = toggleMenu;
window.togglePaymentDetails = togglePaymentDetails;
window.updatePaymentUI = updatePaymentUI;
