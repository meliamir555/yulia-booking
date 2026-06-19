const API_URL = 'https://script.google.com/macros/s/AKfycbwvLSLiRqxr_gzXiuGyPVLSfQmb-ZIhlLhDBMGpZv9fBUYqxf4RXAZjtBnsdtT0nH3JaQ/exec';

const menuToggle = document.getElementById('menuToggle');
const nav = document.getElementById('nav');

if (menuToggle) {
  menuToggle.addEventListener('click', () => {
    nav.classList.toggle('active');
  });
}

const bookingDateInput = document.getElementById('bookingDate');
const timeSlotsContainer = document.getElementById('timeSlots');
const selectedTimeInput = document.getElementById('selectedTime');
const bookingForm = document.getElementById('bookingForm');

const confirmModal = document.getElementById('confirmModal');
const modalClose = document.getElementById('modalClose');
const modalOkBtn = document.getElementById('modalOkBtn');
const modalSummary = document.getElementById('modalSummary');

const availableHours = ['10:00', '12:00', '14:00', '16:00', '18:00'];
const offDays = [2, 3, 4]; // вторник, среда, четверг

let bookings = {};
let blockedDates = [];
let calendar = null;

function getTodayYMD() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function formatDateToYMD(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function formatDateToHuman(dateString) {
  const [year, month, day] = dateString.split('-');
  return `${day}.${month}.${year}`;
}

function getDateObject(dateString) {
  return new Date(`${dateString}T00:00:00`);
}

function isOffDay(dateString) {
  const day = getDateObject(dateString).getDay();
  return offDays.includes(day);
}

function isManuallyBlocked(dateString) {
  return blockedDates.includes(dateString);
}

function getBookedTimes(dateString) {
  return Array.isArray(bookings[dateString]) ? bookings[dateString] : [];
}

function isTimeSlotTooSoon(dateString, timeString) {
  const now = new Date();
  const [year, month, day] = dateString.split('-').map(Number);
  const [hours, minutes] = timeString.split(':').map(Number);
  const slotDate = new Date(year, month - 1, day, hours, minutes, 0);
  const diffInMs = slotDate.getTime() - now.getTime();
  const hours24InMs = 24 * 60 * 60 * 1000;
  return diffInMs < hours24InMs;
}

function getFreeTimes(dateString) {
  if (!dateString) return [];
  if (isOffDay(dateString)) return [];
  if (isManuallyBlocked(dateString)) return [];

  const bookedTimes = getBookedTimes(dateString);

  return availableHours.filter(time => {
    return !bookedTimes.includes(time) && !isTimeSlotTooSoon(dateString, time);
  });
}

function isDateDisabled(dateString) {
  if (!dateString) return true;
  if (isOffDay(dateString)) return true;
  if (isManuallyBlocked(dateString)) return true;
  if (getFreeTimes(dateString).length === 0) return true;
  return false;
}

function resetTimeSlots(message = 'Сначала выберите дату') {
  timeSlotsContainer.innerHTML = `<p class="time-placeholder">${message}</p>`;
  selectedTimeInput.value = '';
}

function renderTimeSlots(dateString) {
  const freeTimes = getFreeTimes(dateString);

  timeSlotsContainer.innerHTML = '';
  selectedTimeInput.value = '';

  if (!freeTimes.length) {
    if (dateString === getTodayYMD() || new Date(dateString) < new Date(new Date().getTime() + 24 * 60 * 60 * 1000)) {
       resetTimeSlots('На ближайшие 24 часа свободных окошек нет');
    } else {
       resetTimeSlots('На эту дату свободных окошек нет');
    }
    return;
  }

  freeTimes.forEach(time => {
    const slot = document.createElement('div');
    slot.classList.add('time-slot');
    slot.textContent = time;

    slot.addEventListener('click', () => {
      document.querySelectorAll('.time-slot').forEach(item => {
        item.classList.remove('active');
      });
      slot.classList.add('active');
      selectedTimeInput.value = time;
    });

    timeSlotsContainer.appendChild(slot);
  });
}

async function loadCalendarData() {
  const response = await fetch(`${API_URL}?_=${Date.now()}`);
  const data = await response.json();

  if (!data.success) {
    throw new Error(data.message || 'Ошибка загрузки данных календаря');
  }

  bookings = data.bookings || {};
  blockedDates = Array.isArray(data.blockedDates) ? data.blockedDates : [];

  refreshCalendarDisabledDates();

  const selectedDate = bookingDateInput.value;
  if (selectedDate) {
    if (isDateDisabled(selectedDate)) {
      if (calendar) calendar.clear();
      resetTimeSlots('Выберите доступную дату');
    } else {
      renderTimeSlots(selectedDate);
    }
  }
}

function refreshCalendarDisabledDates() {
  if (!calendar) return;

  calendar.set('disable', [
    function(date) {
      const dateString = formatDateToYMD(date);
      return isDateDisabled(dateString);
    }
  ]);
  calendar.redraw();
}

function initCalendar() {
  calendar = flatpickr('#bookingDate', {
    locale: 'ru',
    minDate: 'today',
    dateFormat: 'Y-m-d',
    altInput: true,
    altFormat: 'd.m.Y',
    disableMobile: true,
    allowInput: false,
    clickOpens: true,
    disable: [
      function(date) {
        const dateString = formatDateToYMD(date);
        return isDateDisabled(dateString);
      }
    ],
    onChange: function(selectedDates, dateStr) {
      if (!dateStr) {
        resetTimeSlots();
        return;
      }
      if (isManuallyBlocked(dateStr)) {
        resetTimeSlots('Эта дата закрыта мастером');
        return;
      }
      if (isOffDay(dateStr)) {
        resetTimeSlots('Выходные: вторник, среда, четверг');
        return;
      }
      renderTimeSlots(dateStr);
    }
  });
}

if (bookingForm) {
  bookingForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const service = document.getElementById('serviceSelect').value;
    const date = bookingDateInput.value;
    const time = selectedTimeInput.value;
    const name = document.getElementById('clientName').value.trim();
    const phone = document.getElementById('clientPhone').value.trim();

    if (!service || !date || !time) {
      alert('Пожалуйста, заполните все поля.');
      return;
    }

    if (isTimeSlotTooSoon(date, time)) {
      alert('Запись возможна минимум за 24 часа. Пожалуйста, выберите другое время.');
      renderTimeSlots(date);
      return;
    }

    const submitButton = bookingForm.querySelector('button[type="submit"]');
    const oldText = submitButton.textContent;

    submitButton.disabled = true;
    submitButton.textContent = 'Отправляем...';

    try {
      const body = new URLSearchParams({
        action: 'createBooking',
        service,
        date,
        time,
        name,
        phone
      });

      const response = await fetch(API_URL, {
        method: 'POST',
        body
      });

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.message || 'Не удалось оформить запись.');
      }

      await loadCalendarData();

      if (!isDateDisabled(date)) {
        renderTimeSlots(date);
      } else {
        resetTimeSlots('Выберите другую дату');
      }

      // ПРОСТОЕ ОКОШКО БЕЗ КНОПКИ TELEGRAM
      modalSummary.innerHTML = `
        <strong>${name}</strong>, место предварительно забронировано!<br><br>
        Услуга: <strong>${service}</strong><br>
        Дата: <strong>${formatDateToHuman(date)}</strong><br>
        Время: <strong>${time}</strong><br><br>
        Я свяжусь с вами в ближайшее время для подтверждения. Жду встречи!
      `;

      confirmModal.classList.add('active');
    } catch (error) {
      alert(error.message);
      console.error(error);
    } finally {
      submitButton.disabled = false;
      submitButton.textContent = oldText;
    }
  });
}

function closeModal() {
  confirmModal.classList.remove('active');
  bookingForm.reset();
  selectedTimeInput.value = '';
  resetTimeSlots('Сначала выберите дату');

  if (calendar) {
    calendar.clear();
  }
}

if (modalClose) modalClose.addEventListener('click', closeModal);
if (modalOkBtn) modalOkBtn.addEventListener('click', closeModal);

window.addEventListener('click', (e) => {
  if (e.target === confirmModal) {
    closeModal();
  }
});

(async function init() {
  if (!API_URL || API_URL.includes('ВСТАВЬ_СЮДА')) {
    alert('В script.js нужно вставить URL из Google Apps Script.');
    return;
  }
  resetTimeSlots('Сначала выберите дату');
  try {
    await loadCalendarData();
    initCalendar();
  } catch (error) {
    console.error(error);
    alert('Не удалось загрузить данные календаря. Проверь URL Apps Script.');
  }
})();