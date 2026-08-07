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

function timeToMinutes(timeString) {
  const [hours, minutes] = timeString.split(':').map(Number);
  return hours * 60 + minutes;
}

function isToday(dateString) {
  return dateString === getTodayYMD();
}

function isPastTimeForDate(dateString, timeString) {
  if (!isToday(dateString)) return false;

  const now = new Date();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const slotMinutes = timeToMinutes(timeString);

  return slotMinutes <= nowMinutes;
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

function getFreeTimes(dateString) {
  if (!dateString) return [];
  if (isOffDay(dateString)) return [];
  if (isManuallyBlocked(dateString)) return [];

  const bookedTimes = getBookedTimes(dateString);

  return availableHours.filter(time => {
    return !bookedTimes.includes(time) && !isPastTimeForDate(dateString, time);
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
  // Получаем список уже занятых часов на эту дату
  const bookedTimes = getBookedTimes(dateString);
  const freeTimes = getFreeTimes(dateString);

  timeSlotsContainer.innerHTML = '';
  selectedTimeInput.value = '';

  // Если свободных мест совсем нет, показываем сообщение
  if (!freeTimes.length) {
    if (isToday(dateString)) {
      resetTimeSlots('На сегодня свободных окошек больше нет');
    } else {
      resetTimeSlots('На эту дату все окошки заняты');
    }
    return;
  }

  // Перебираем ВСЕ часы работы из массива availableHours
  availableHours.forEach(time => {
    const slot = document.createElement('div');
    slot.classList.add('time-slot');
    slot.textContent = time;

    // Проверяем, занято ли это время кем-то другим или оно уже прошло
    const isBooked = bookedTimes.includes(time);
    const isPast = isPastTimeForDate(dateString, time);

    if (isBooked || isPast) {
      // Делаем слот серым и неактивным
      slot.classList.add('disabled');
      if (isBooked) slot.title = 'Это время уже занято';
      if (isPast) slot.title = 'Это время уже прошло';
    } else {
      // Если слот свободен, добавляем возможность по нему кликнуть
      slot.addEventListener('click', () => {
        // Убираем активный класс у всех незаблокированных элементов
        document.querySelectorAll('.time-slot:not(.disabled)').forEach(item => {
          item.classList.remove('active');
        });
        
        slot.classList.add('active');
        selectedTimeInput.value = time;
      });
    }

    timeSlotsContainer.appendChild(slot);
  });
}

async function loadCalendarData() {
  // Обращаемся напрямую к вашему PHP-обработчику
  const response = await fetch(`get-calendar-data.php?_=${Date.now()}`);
  const data = await response.json();

  // Если сервер вернул не объект с данными, а ошибку
  if (data.error || !data) {
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

    if (!service) {
      alert('Пожалуйста, выберите услугу.');
      return;
    }

    if (!date) {
      alert('Пожалуйста, выберите дату.');
      return;
    }

    if (isOffDay(date)) {
      alert('Во вторник, среду и четверг записи нет.');
      return;
    }

    if (isManuallyBlocked(date)) {
      alert('Эта дата закрыта для записи.');
      return;
    }

    if (!time) {
      alert('Пожалуйста, выберите удобное время.');
      return;
    }

    if (isPastTimeForDate(date, time)) {
      alert('Это время на сегодня уже прошло.');
      renderTimeSlots(date);
      return;
    }

    const submitButton = bookingForm.querySelector('button[type="submit"]');
    const oldText = submitButton.textContent;

    submitButton.disabled = true;
    submitButton.textContent = 'Отправляем...';

    try {
      // Формируем JSON-объект, так как booking.php ждет JSON
      const requestData = {
        service,
        date,
        time,
        name,
        phone
      };

      // Отправляем данные в booking.php
      const response = await fetch('booking.php', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestData)
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

      modalSummary.innerHTML = `
        <strong>${name}</strong>, вы успешно записаны!<br><br>
        Услуга: <strong>${service}</strong><br>
        Дата: <strong>${formatDateToHuman(date)}</strong><br>
        Время: <strong>${time}</strong><br><br>
        Ваша запись сохранена. Юлия свяжется с вами при необходимости.
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

if (modalClose) {
  modalClose.addEventListener('click', closeModal);
}

if (modalOkBtn) {
  modalOkBtn.addEventListener('click', closeModal);
}

window.addEventListener('click', (e) => {
  if (e.target === confirmModal) {
    closeModal();
  }
});

(async function init() {
  resetTimeSlots('Сначала выберите дату');

  try {
    await loadCalendarData();
    initCalendar();
  } catch (error) {
    console.error(error);
    alert('Не удалось загрузить данные календаря.');
  }
})();
