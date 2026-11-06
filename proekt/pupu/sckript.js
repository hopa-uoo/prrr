// ============================================
// DEADLINE — логика приложения
// ============================================

// ---------- 1. Хранилище ----------

const STORAGE_KEY = 'deadlines';
const ONBOARDING_KEY = 'onboardingDone';
const FIRST_CLASS_KEY = 'firstClassTime';
const NAME_KEY = 'userName';
const DEFAULT_FIRST_CLASS = '08:30';

// Версия сборки — видна в профиле, чтобы понимать, обновился ли сайт
const APP_VERSION = '1.9 · 02.11.2026';

// Приводим дедлайн к единому виду.
// Нужно, чтобы старые записи (без статуса, заметок) тоже работали.
function normalizeTask(item) {
    let status = item.status;

    // Раньше был только флаг done — переносим его в новый статус
    if (!status) {
        status = item.done === true ? 'done' : 'todo';
    }

    return {
        id: item.id || 'id-' + Date.now() + '-' + Math.floor(Math.random() * 100000),
        subject: item.subject || 'Без предмета',
        title: item.title || '',
        date: item.date || '',
        time: item.time || '23:59',
        notes: item.notes || '',
        status: status
    };
}

function loadTasks() {
    const saved = localStorage.getItem(STORAGE_KEY);
    let items = [];

    if (saved) {
        // try/catch — страховка: если в сохранении окажется мусор,
        // приложение не упадёт, а просто начнёт с пустого списка
        try {
            items = JSON.parse(saved);
        } catch (error) {
            items = [];
        }
    }

    return items.map(normalizeTask);
}

function saveTasks() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
}


// ---------- 2. Состояние приложения ----------

let tasks = loadTasks();         // все дедлайны
let openedTask = null;           // какая карточка открыта в подробностях
let editingTaskId = null;        // что редактируем (null = добавляем)
let calendarDate = new Date();   // какой месяц показываем
let selectedDay = toKey(new Date());
let searchQuery = '';
let deadlineFilter = 'active';
let previousScreen = 'home';     // куда вернуться после сохранения
let collapsedSubjects = [];      // какие предметы свёрнуты
let quizStepIndex = 0;           // какой вопрос персонализации открыт


// ---------- 3. Помощники для дат ----------

const MONTHS_FULL = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
    'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];

const MONTHS_SHORT = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн',
    'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];

const MONTHS_TITLE = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
    'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];

function pad(number) {
    return number < 10 ? '0' + number : String(number);
}

// Как зовут пользователя
function getName() {
    return localStorage.getItem(NAME_KEY) || '';
}

// Во сколько начинается первая пара (задаёт пользователь)
function getFirstClassTime() {
    const saved = localStorage.getItem(FIRST_CLASS_KEY);

    if (saved && /^\d{2}:\d{2}$/.test(saved)) {
        return saved;
    }

    return DEFAULT_FIRST_CLASS;
}

// Время нового дедлайна по умолчанию — за 30 минут до первой пары
function deadlineDefaultTime() {
    const parts = getFirstClassTime().split(':');
    let minutes = Number(parts[0]) * 60 + Number(parts[1]) - 30;

    if (minutes < 0) minutes = 0;

    return pad(Math.floor(minutes / 60)) + ':' + pad(minutes % 60);
}

// Дата -> "2026-10-30"
function toKey(dateObj) {
    return dateObj.getFullYear() + '-' + pad(dateObj.getMonth() + 1) + '-' + pad(dateObj.getDate());
}

// "2026-10-30" -> объект Date (местное время, без сюрпризов с часовыми поясами)
function parseDate(key) {
    const parts = key.split('-');
    return new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
}

// Сколько дней осталось до даты (меньше нуля = просрочено)
function daysLeft(key) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const deadline = parseDate(key);
    deadline.setHours(0, 0, 0, 0);

    // 86 400 000 миллисекунд = один день
    return Math.round((deadline - today) / 86400000);
}

function formatDateShort(key) {
    const d = parseDate(key);
    return d.getDate() + ' ' + MONTHS_SHORT[d.getMonth()];
}

function formatDateFull(key) {
    const d = parseDate(key);
    return d.getDate() + ' ' + MONTHS_FULL[d.getMonth()];
}

// Правильное окончание: 1 задание / 2 задания / 5 заданий
function tasksWord(count) {
    const last = count % 10;
    const lastTwo = count % 100;

    if (last === 1 && lastTwo !== 11) return 'задание';
    if (last >= 2 && last <= 4 && (lastTwo < 10 || lastTwo >= 20)) return 'задания';
    return 'заданий';
}

// Сначала самые близкие по дате и времени
function compareTasks(a, b) {
    const first = (a.date || '') + ' ' + (a.time || '23:59');
    const second = (b.date || '') + ' ' + (b.time || '23:59');

    if (first < second) return -1;
    if (first > second) return 1;
    return 0;
}

// Выполненные дедлайны всегда в конце списка
function compareTasksWithDone(a, b) {
    const aDone = a.status === 'done' ? 1 : 0;
    const bDone = b.status === 'done' ? 1 : 0;

    if (aDone !== bDone) return aDone - bDone;
    return compareTasks(a, b);
}

// Что показать в строке срока
function statusFor(days) {
    if (days < 0) return { text: 'Просрочено', type: 'overdue' };
    if (days === 0) return { text: 'Сегодня', type: 'today' };
    if (days === 1) return { text: 'Завтра', type: 'soon' };
    if (days <= 3) return { text: 'Через ' + days + ' дн.', type: 'soon' };
    return { text: 'Через ' + days + ' дн.', type: 'ok' };
}

// Группы для страницы "Дедлайны"
const DEADLINE_GROUPS = [
    { title: 'Просрочено', test: function (days) { return days < 0; } },
    { title: 'Сегодня', test: function (days) { return days === 0; } },
    { title: 'Завтра', test: function (days) { return days === 1; } },
    { title: 'На этой неделе', test: function (days) { return days > 1 && days <= 7; } },
    { title: 'Позже', test: function (days) { return days > 7; } }
];


// ---------- 4. Иконки для предметов ----------

const SUBJECT_STYLES = [
    { words: ['истор'], icon: '🏛', color: '#e0e9f7' },
    { words: ['англ', 'язык'], icon: '📖', color: '#e7e2f7' },
    { words: ['матем', 'алгебр', 'геометр', 'вышмат'], icon: '🧮', color: '#dfeaf8' },
    { words: ['социолог'], icon: '👥', color: '#f7e3e7' },
    { words: ['программ', 'информ'], icon: '💻', color: '#dcefe8' },
    { words: ['философ'], icon: '🧠', color: '#f4e9db' },
    { words: ['физик'], icon: '⚛️', color: '#e3eef8' },
    { words: ['хим'], icon: '🧪', color: '#e7f0e2' },
    { words: ['биолог', 'эколог'], icon: '🌿', color: '#e2f0e6' },
    { words: ['эконом'], icon: '📈', color: '#e6edf7' },
    { words: ['прав', 'юрид'], icon: '⚖️', color: '#efe7f5' }
];

// Подбираем картинку и цвет по названию предмета
function subjectMeta(name) {
    const lower = name.toLowerCase();

    for (let style of SUBJECT_STYLES) {
        for (let word of style.words) {
            if (lower.includes(word)) {
                return { icon: style.icon, color: style.color };
            }
        }
    }

    return { icon: '📘', color: '#e3eef8' };
}


// ---------- 5. Проверка названия предмета ----------

// Возвращает { error } для явных ошибок и { warning } для подозрительных названий
function checkSubject(value) {
    const name = value.trim().replace(/\s+/g, ' ');

    if (name === '') {
        return { error: 'Введи название предмета' };
    }

    if (name.length < 3) {
        return { error: 'Название предмета слишком короткое — минимум 3 символа' };
    }

    if (name.length > 60) {
        return { error: 'Название предмета слишком длинное — максимум 60 символов' };
    }

    if (!/[а-яёa-z]/i.test(name)) {
        return { error: 'В названии предмета должны быть буквы' };
    }

    if (!/^[а-яёa-z0-9\s\-().,]+$/i.test(name)) {
        return { error: 'В названии допустимы только буквы, цифры, пробел, дефис, точка и скобки' };
    }

    // Мягкая проверка «на адекватность»: ловим случайный набор вроде «пупупу».
    // Смотрим сразу несколько признаков «кракозябр»:
    const letters = name.toLowerCase().replace(/[^а-яёa-z]/g, '');
    const unique = [];

    for (let char of letters) {
        if (!unique.includes(char)) unique.push(char);
    }

    // 1) слишком мало разных букв (пупупупу)
    const tooFewLetters = letters.length >= 3 && unique.length / letters.length < 0.45;

    // 2) три гласных подряд (ыаы...) — в русском так почти не бывает
    const vowelRun = /[аеёиоуыэюя]{3,}/.test(letters);

    // 3) буква «ы» после гласной — в русском невозможно (аы, оы)
    const yAfterVowel = /[аеёиоуэюя]ы/.test(letters);

    // 4) нет ни одной гласной (брбр)
    const noVowel = !/[аеёиоуыэюяaeiouy]/.test(letters);

    // 5) «проезд» по клавиатуре (фыва, qwer)
    const keyboardRun = KEYBOARD_RUNS.some(function (run) {
        return letters.includes(run);
    });

    if (tooFewLetters || vowelRun || yAfterVowel || noVowel || keyboardRun) {
        return { name: name, warning: true };
    }

    return { name: name };
}


// ---------- 5.1. Проверка на нецензурную лексику ----------

// Корни слов — так фильтр ловит любые формы
const BAD_WORDS = [
    'хуй', 'хуя', 'хую', 'хуе', 'хуи',
    'пизд',
    'еба', 'ебал', 'ебан', 'ебет', 'ебёт', 'ебуч', 'ебло',
    'ёба', 'ёбал', 'ёбан', 'ёбет', 'ёбёт', 'ёбуч', 'ёбло', 'ёбн',
    'бляд', 'блят', 'блядь', 'бля',
    'сука', 'суки', 'суке', 'суку', 'сукой', 'сучк', 'суч',
    'мудак', 'мудил', 'мудо',
    'пидор', 'пидар', 'пидр', 'педик',
    'гандон', 'гондон',
    'залуп',
    'дроч',
    'шлюх', 'шлюш',
    'жоп',
    'срак', 'срат', 'срёт', 'срет',
    'сперм',
    'мастурб', 'онани'
];

function hasBadWords(text) {
    const lower = String(text || '').toLowerCase();

    return BAD_WORDS.some(function (word) {
        return lower.includes(word);
    });
}


// ---------- 5.2. Шутливые слова ----------

// Шутливые слова: ищем вхождение, потому что «пиписька» содержит «писька»
const FUNNY_PARTS = ['пися', 'писю', 'писе', 'писей', 'писька', 'письки', 'писюн'];

// Некультурные, но не матерные слова: сравниваем слово ЦЕЛИКОМ,
// иначе «лох» найдётся в «плохо», а «попа» — в «попасть»
const FUNNY_EXACT = [
    'лох', 'лоха', 'лоху', 'лохом', 'лохе', 'лохи', 'лохов', 'лохам', 'лохами', 'лохах',
    'чмо', 'чмошник', 'чмошника', 'чмошнику', 'чмошником', 'чмошники', 'чмошников',

    'попа', 'попы', 'попе', 'попу', 'попой', 'попою', 'попам', 'попами', 'попах',
    'попка', 'попки', 'попке', 'попку', 'попкой', 'попкою', 'попок', 'попкам', 'попками',

    'сиська', 'сиськи', 'сиське', 'сиську', 'сиськой', 'сисек', 'сиськам', 'сиськами', 'сиськах',

    'член', 'члена', 'члену', 'членом', 'члене', 'члены', 'членов', 'членам', 'членами', 'членах',

    'пипка', 'пипки', 'пипке', 'пипку', 'пипкой'
];

// Наборы букв, которые получаются при «проезде» по клавиатуре
const KEYBOARD_RUNS = ['йцук', 'фыва', 'ячсм', 'qwer', 'asdf', 'zxcv'];

function findFunnyWord(text) {
    const lower = String(text || '').toLowerCase();
    const words = lower.split(/[^а-яёa-z]+/);

    // Сначала проверяем «пися» и родственные — вхождением
    for (let part of FUNNY_PARTS) {
        for (let word of words) {
            if (word.includes(part)) {
                return word;
            }
        }
    }

    // Потом — целые слова вроде «лох» и «чмо»
    for (let word of words) {
        if (FUNNY_EXACT.includes(word)) {
            return word;
        }
    }

    return null;
}


// ---------- 6. Карточка одного дедлайна ----------

// options.compact — короткая версия для экрана предмета:
// без повторения названия предмета и без стрелочки
function createTaskCard(task, options) {
    const opts = options || {};
    const isCompact = opts.compact === true;

    const meta = subjectMeta(task.subject);
    const isDone = task.status === 'done';
    const isProgress = task.status === 'progress';
    const status = isDone
        ? { text: 'Сдано', type: 'done' }
        : statusFor(daysLeft(task.date));

    // Карточка — это кнопка: по нажатию открываются подробности
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'task-card' + (isDone ? ' task-card--done' : '');

    // В обычной карточке слева — иконка предмета,
    // в компактной — номер задания в списке
    const leftPart = isCompact
        ? '<span class="task-card__num"></span>'
        : '<div class="task-card__icon"></div>';

    card.innerHTML =
        leftPart +
        '<div class="task-card__info">' +
            '<span class="task-card__subject"></span>' +
            (isCompact ? '' : '<span class="task-card__title"></span>') +
            '<span class="task-card__date"></span>' +
            '<span class="task-card__state"></span>' +
        '</div>' +
        (isCompact ? '' : '<span class="chevron">›</span>');

    if (isCompact) {
        card.classList.add('task-card--compact');
        card.querySelector('.task-card__num').textContent = opts.index || '';
    } else {
        const icon = card.querySelector('.task-card__icon');
        icon.textContent = meta.icon;
        icon.style.backgroundColor = meta.color;
    }

    // Главная строка: в обычной карточке — предмет, в компактной — название задания
    const subjectEl = card.querySelector('.task-card__subject');
    if (isCompact) {
        if (task.title) {
            subjectEl.textContent = task.title;
        } else {
            subjectEl.textContent = 'Без названия';
            subjectEl.classList.add('task-card__subject--empty');
        }
    } else {
        subjectEl.textContent = task.subject;
    }

    const titleEl = card.querySelector('.task-card__title');
    if (titleEl) {
        if (task.title) {
            titleEl.textContent = task.title;
        } else {
            titleEl.remove();
        }
    }

    const dateEl = card.querySelector('.task-card__date');
    dateEl.textContent = '📅 ' + formatDateShort(task.date) + ', ' + task.time;
    if (!isDone) {
        dateEl.classList.add('task-card__date--' + status.type);
    }

    // Плашка «В работе»
    const stateEl = card.querySelector('.task-card__state');
    if (isProgress) {
        stateEl.textContent = 'В работе';
    } else {
        stateEl.remove();
    }

    card.addEventListener('click', function () {
        openDetail(task);
    });

    return card;
}

function showEmpty(container, icon, text, hint) {
    container.innerHTML =
        '<div class="empty">' +
            '<div class="empty__icon"></div>' +
            '<p class="empty__text"></p>' +
            '<p class="empty__hint"></p>' +
        '</div>';

    container.querySelector('.empty__icon').textContent = icon;
    container.querySelector('.empty__text').textContent = text;
    container.querySelector('.empty__hint').textContent = hint;
}


// ---------- 7. Экран "Главная" ----------

function renderWeek() {
    const weekDays = document.getElementById('weekDays');
    const names = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
    const now = new Date();

    // Находим понедельник текущей недели
    const weekdayIndex = (now.getDay() + 6) % 7;   // понедельник = 0, воскресенье = 6
    const monday = new Date(now);
    monday.setDate(now.getDate() - weekdayIndex);

    weekDays.innerHTML = '';

    for (let i = 0; i < 7; i++) {
        const day = new Date(monday);
        day.setDate(monday.getDate() + i);

        const cell = document.createElement('div');
        cell.className = 'week__day' + (toKey(day) === toKey(now) ? ' is-today' : '');
        cell.innerHTML =
            '<span class="week__day-name"></span>' +
            '<span class="week__day-num"></span>';

        cell.querySelector('.week__day-name').textContent = names[i];
        cell.querySelector('.week__day-num').textContent = day.getDate();

        weekDays.appendChild(cell);
    }
}

// Приветствие и аватарка с первой буквой имени
function renderGreeting() {
    const greeting = document.getElementById('greeting');
    const avatar = document.getElementById('avatar');
    const name = getName();

    if (name) {
        greeting.textContent = 'Привет, ' + name + '!';
        avatar.textContent = name.charAt(0).toUpperCase();
    } else {
        greeting.textContent = 'Привет!';
        avatar.innerHTML =
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"' +
            ' stroke-linecap="round" stroke-linejoin="round">' +
            '<circle cx="12" cy="8" r="4"></circle>' +
            '<path d="M4.5 21a7.5 7.5 0 0 1 15 0"></path></svg>';
    }
}

function renderHome() {
    renderWeek();
    renderGreeting();

    const homeList = document.getElementById('homeList');
    const query = searchQuery.toLowerCase().trim();

    const active = tasks
        .filter(function (task) { return task.status !== 'done'; })
        .filter(function (task) {
            if (query === '') return true;
            return task.subject.toLowerCase().includes(query) ||
                (task.title || '').toLowerCase().includes(query);
        })
        .sort(compareTasks);

    homeList.innerHTML = '';

    if (active.length === 0) {
        showEmpty(homeList, '🗓', 'Пока пусто', 'Нажми «+», чтобы добавить дедлайн');
        return;
    }

    for (let task of active) {
        homeList.appendChild(createTaskCard(task));
    }
}


// ---------- 8. Экран "Дедлайны" ----------

function renderDeadlines() {
    const container = document.getElementById('deadlinesList');
    const totalEl = document.getElementById('deadlinesTotal');

    let items = tasks.slice();

    if (deadlineFilter === 'active') {
        items = items.filter(function (task) { return task.status !== 'done'; });
    } else if (deadlineFilter === 'progress') {
        items = items.filter(function (task) { return task.status === 'progress'; });
    } else if (deadlineFilter === 'done') {
        items = items.filter(function (task) { return task.status === 'done'; });
    }

    items.sort(compareTasksWithDone);

    totalEl.textContent = items.length > 0
        ? items.length + ' ' + tasksWord(items.length)
        : '';

    container.innerHTML = '';

    if (items.length === 0) {
        if (deadlineFilter === 'progress') {
            showEmpty(container, '📌', 'Пока ничего в работе', 'Открой дедлайн и нажми «Взять в работу»');
        } else if (deadlineFilter === 'done') {
            showEmpty(container, '✓', 'Пока нет выполненных', 'Отмечай сданное — оно появится здесь');
        } else {
            showEmpty(container, '🗓', 'Пока пусто', 'Нажми «+», чтобы добавить дедлайн');
        }
        return;
    }

    // Для фильтра "Выполненные" достаточно простого списка
    if (deadlineFilter === 'done') {
        for (let task of items) {
            container.appendChild(createTaskCard(task));
        }
        return;
    }

    // Остальные раскладываем по срочности
    const activeItems = items.filter(function (task) { return task.status !== 'done'; });
    const doneItems = items.filter(function (task) { return task.status === 'done'; });

    for (let group of DEADLINE_GROUPS) {
        const groupItems = activeItems.filter(function (task) {
            return group.test(daysLeft(task.date));
        });

        if (groupItems.length === 0) continue;

        const wrap = document.createElement('div');
        wrap.className = 'deadline-group';

        const title = document.createElement('h2');
        title.className = 'deadline-group__title';
        title.innerHTML = '<span></span><span class="deadline-group__count"></span>';
        title.querySelector('span').textContent = group.title;
        title.querySelector('.deadline-group__count').textContent = groupItems.length;

        wrap.appendChild(title);

        for (let task of groupItems) {
            wrap.appendChild(createTaskCard(task));
        }

        container.appendChild(wrap);
    }

    // Если в фильтре "Все" есть выполненные — показываем их в конце
    if (doneItems.length > 0) {
        const wrap = document.createElement('div');
        wrap.className = 'deadline-group';

        const title = document.createElement('h2');
        title.className = 'deadline-group__title';
        title.innerHTML = '<span></span><span class="deadline-group__count"></span>';
        title.querySelector('span').textContent = 'Выполненные';
        title.querySelector('.deadline-group__count').textContent = doneItems.length;

        wrap.appendChild(title);

        for (let task of doneItems) {
            wrap.appendChild(createTaskCard(task));
        }

        container.appendChild(wrap);
    }
}


// ---------- 9. Экран "Календарь" ----------

function renderCalendar() {
    const title = document.getElementById('calendarTitle');
    const grid = document.getElementById('calendarGrid');

    const year = calendarDate.getFullYear();
    const month = calendarDate.getMonth();

    title.textContent = MONTHS_TITLE[month] + ' ' + year;
    grid.innerHTML = '';

    const firstDay = new Date(year, month, 1);
    const offset = (firstDay.getDay() + 6) % 7;                 // пустые клетки в начале
    const daysInMonth = new Date(year, month + 1, 0).getDate(); // число дней в месяце
    const todayKey = toKey(new Date());

    for (let i = 0; i < offset; i++) {
        grid.appendChild(document.createElement('div'));
    }

    for (let day = 1; day <= daysInMonth; day++) {
        const key = year + '-' + pad(month + 1) + '-' + pad(day);

        const cell = document.createElement('button');
        cell.className = 'cal-day';
        cell.textContent = day;

        if (key === todayKey) cell.classList.add('is-today');
        if (key === selectedDay) cell.classList.add('is-selected');

        const hasTask = tasks.some(function (task) {
            return task.date === key;
        });
        if (hasTask) cell.classList.add('has-task');

        cell.addEventListener('click', function () {
            selectedDay = key;
            renderCalendar();
        });

        grid.appendChild(cell);
    }

    renderCalendarDay();
}

function renderCalendarDay() {
    const title = document.getElementById('calendarDayTitle');
    const countEl = document.getElementById('calendarDayCount');
    const listEl = document.getElementById('calendarList');
    const todayKey = toKey(new Date());

    title.textContent = selectedDay === todayKey
        ? 'Дедлайны на сегодня'
        : 'Дедлайны на ' + formatDateFull(selectedDay);

    const dayTasks = tasks
        .filter(function (task) { return task.date === selectedDay; })
        .sort(compareTasksWithDone);

    countEl.textContent = dayTasks.length > 0 ? String(dayTasks.length) : '';
    listEl.innerHTML = '';

    if (dayTasks.length === 0) {
        listEl.innerHTML = '<p class="hint">На этот день ничего не задано</p>';
        return;
    }

    for (let task of dayTasks) {
        listEl.appendChild(createTaskCard(task));
    }
}


// ---------- 10. Экран "Предметы" ----------
// Каждый предмет показан вместе со своими дедлайнами:
// до задания можно добраться в один клик, без промежуточного экрана.

function renderSubjects() {
    const container = document.getElementById('subjectsList');
    const names = [];

    for (let task of tasks) {
        if (!names.includes(task.subject)) {
            names.push(task.subject);
        }
    }

    names.sort();
    container.innerHTML = '';

    if (names.length === 0) {
        showEmpty(container, '📚', 'Предметов пока нет', 'Они появятся, когда добавишь дедлайн');
        return;
    }

    for (let name of names) {
        const meta = subjectMeta(name);
        const subjectTasks = tasks
            .filter(function (task) { return task.subject === name; })
            .sort(compareTasksWithDone);

        const isCollapsed = collapsedSubjects.includes(name);

        const group = document.createElement('div');
        group.className = 'subject-group' + (isCollapsed ? ' is-collapsed' : '');

        // Шапка предмета: иконка, название, количество и три кнопки
        const head = document.createElement('div');
        head.className = 'subject-group__head' + (isCollapsed ? ' is-collapsed' : '');
        head.innerHTML =
            '<span class="subject-row__icon"></span>' +
            '<span class="subject-row__info">' +
                '<span class="subject-row__name"></span>' +
                '<span class="subject-row__count"></span>' +
            '</span>' +
            '<span class="subject-group__actions">' +
                '<button class="icon-btn icon-btn--sm icon-btn--chevron" type="button" data-act="toggle" aria-label="Свернуть или развернуть список">' +
                    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"></path></svg>' +
                '</button>' +
                '<button class="icon-btn icon-btn--sm" type="button" data-act="add" aria-label="Добавить задание">+</button>' +
                '<button class="icon-btn icon-btn--sm icon-btn--danger" type="button" data-act="delete" aria-label="Удалить предмет">' +
                    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16"></path><path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"></path><path d="M6 7l1 12a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-12"></path><path d="M10 11v5M14 11v5"></path></svg>' +
                '</button>' +
            '</span>';

        const iconEl = head.querySelector('.subject-row__icon');
        iconEl.textContent = meta.icon;
        iconEl.style.backgroundColor = meta.color;

        head.querySelector('.subject-row__name').textContent = name;
        head.querySelector('.subject-row__count').textContent =
            subjectTasks.length + ' ' + tasksWord(subjectTasks.length);

        // Три действия: свернуть, добавить задание, удалить предмет
        head.addEventListener('click', function (event) {
            const button = event.target.closest('button');
            if (!button) return;

            const action = button.dataset.act;

            if (action === 'add') {
                openAdd(name);
            } else if (action === 'toggle') {
                toggleSubject(name);
            } else if (action === 'delete') {
                deleteSubject(name);
            }
        });

        group.appendChild(head);

        // Дедлайны этого предмета — с отступом и нумерацией, как список
        if (!isCollapsed) {
            const inner = document.createElement('div');
            inner.className = 'list subject-group__tasks';

            if (subjectTasks.length === 0) {
                inner.innerHTML = '<p class="hint">Здесь пока нет заданий</p>';
            } else {
                subjectTasks.forEach(function (task, index) {
                    inner.appendChild(createTaskCard(task, {
                        compact: true,
                        index: index + 1
                    }));
                });
            }

            group.appendChild(inner);
        }

        container.appendChild(group);
    }
}

// Свернуть / развернуть список заданий у предмета
function toggleSubject(name) {
    const index = collapsedSubjects.indexOf(name);

    if (index === -1) {
        collapsedSubjects.push(name);
    } else {
        collapsedSubjects.splice(index, 1);
    }

    renderSubjects();
}

// Удалить предмет вместе со всеми его заданиями
function deleteSubject(name) {
    const count = tasks.filter(function (task) {
        return task.subject === name;
    }).length;

    if (!confirm('Удалить предмет «' + name + '» и ' + count + ' ' + tasksWord(count) + '?')) return;

    tasks = tasks.filter(function (task) {
        return task.subject !== name;
    });

    const index = collapsedSubjects.indexOf(name);
    if (index !== -1) collapsedSubjects.splice(index, 1);

    saveTasks();
    refresh();
}


// ---------- 11. Профиль: статистика и уведомления ----------

// Поля в профиле всегда показывают актуальные значения.
// Нужно потому, что анкету можно пройти уже после загрузки страницы.
function syncSettingsInputs() {
    const nameInput = document.getElementById('settingsName');
    const classInput = document.getElementById('firstClassInput');

    // Не трогаем поле, если пользователь сейчас в нём печатает
    if (document.activeElement !== nameInput) {
        nameInput.value = getName();
    }

    if (document.activeElement !== classInput) {
        classInput.value = getFirstClassTime();
    }
}

function renderProfile() {
    syncSettingsInputs();

    const total = tasks.length;
    const doneCount = tasks.filter(function (task) { return task.status === 'done'; }).length;
    const percent = total === 0 ? 0 : Math.round((doneCount / total) * 100);

    const ring = document.getElementById('statsRing');
    ring.style.background =
        'conic-gradient(var(--accent) ' + percent + '%, #e5eef6 ' + percent + '%)';

    document.getElementById('statsPercent').textContent = percent + '%';
    document.getElementById('statsCount').textContent =
        doneCount + ' из ' + total + ' ' + tasksWord(total) + ' выполнено';

    // Сколько прошедших дедлайнов можно убрать
    const pastCount = tasks.filter(function (task) {
        return task.status !== 'done' && daysLeft(task.date) < 0;
    }).length;

    const clearCountEl = document.getElementById('clearPastCount');

    if (pastCount > 0) {
        clearCountEl.textContent = String(pastCount);
        clearCountEl.classList.remove('settings__value--done');
    } else {
        clearCountEl.textContent = '✓ всё удалено';
        clearCountEl.classList.add('settings__value--done');
    }

    renderStatsBars();
    renderNotifications();
}

function renderStatsBars() {
    const container = document.getElementById('statsBars');
    const names = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
    const counts = [0, 0, 0, 0, 0, 0, 0];

    for (let task of tasks) {
        const date = parseDate(task.date);
        const index = (date.getDay() + 6) % 7;
        counts[index]++;
    }

    const max = Math.max.apply(null, counts.concat([1]));

    container.innerHTML = '';

    for (let i = 0; i < 7; i++) {
        const bar = document.createElement('div');
        bar.className = 'bar';
        bar.innerHTML = '<div class="bar__fill"></div><span class="bar__label"></span>';

        const fill = bar.querySelector('.bar__fill');
        const height = counts[i] === 0 ? 4 : Math.round((counts[i] / max) * 54) + 4;
        fill.style.height = height + 'px';

        bar.querySelector('.bar__label').textContent = names[i];
        container.appendChild(bar);
    }
}

function renderNotifications() {
    const container = document.getElementById('notificationsList');
    const active = tasks
        .filter(function (task) { return task.status !== 'done'; })
        .sort(compareTasks);

    const notes = [];

    for (let task of active) {
        const days = daysLeft(task.date);
        const about = task.subject + (task.title ? ' — ' + task.title : '');
        const mark = task.status === 'progress' ? 'в работе · ' : '';

        if (days < 0) {
            notes.push({
                icon: '⚠️',
                title: mark ? 'Просрочено, в работе' : 'Просрочено',
                text: about,
                sub: 'срок прошёл ' + formatDateShort(task.date)
            });
        } else if (days === 0) {
            notes.push({
                icon: '🔥',
                title: 'Сдавать сегодня',
                text: about,
                sub: mark + 'до ' + task.time
            });
        } else if (days <= 3) {
            notes.push({
                icon: '⏳',
                title: 'Скоро дедлайн',
                text: about,
                sub: mark + 'осталось ' + days + ' дн.'
            });
        }
    }

    container.innerHTML = '';

    if (notes.length === 0) {
        container.innerHTML = '<p class="hint">пока что пусто...</p>';
        return;
    }

    for (let note of notes) {
        const card = document.createElement('div');
        card.className = 'notification';
        card.innerHTML =
            '<div class="notification__icon"></div>' +
            '<div>' +
                '<p class="notification__title"></p>' +
                '<p class="notification__text"></p>' +
                '<p class="notification__sub"></p>' +
            '</div>';

        card.querySelector('.notification__icon').textContent = note.icon;
        card.querySelector('.notification__title').textContent = note.title;
        card.querySelector('.notification__text').textContent = note.text;
        card.querySelector('.notification__sub').textContent = note.sub;

        container.appendChild(card);
    }
}


// ---------- 12. Переключение экранов ----------

function showScreen(name) {
    document.querySelectorAll('.screen').forEach(function (screen) {
        screen.classList.toggle('is-active', screen.id === 'screen-' + name);
    });

    document.querySelectorAll('.nav__item').forEach(function (button) {
        button.classList.toggle('is-active', button.dataset.screen === name);
    });

    if (name === 'home') renderHome();
    if (name === 'deadlines') renderDeadlines();
    if (name === 'calendar') renderCalendar();
    if (name === 'subjects') renderSubjects();
    if (name === 'profile') renderProfile();
}

// Перерисовать всё (после любых изменений данных)
function refresh() {
    renderHome();
    renderDeadlines();
    renderCalendar();
    renderSubjects();
    renderProfile();
}

function currentScreenName() {
    const active = document.querySelector('.screen.is-active');
    return active ? active.id.replace('screen-', '') : 'home';
}


// ---------- 13. Подробности дедлайна ----------

// Заполняем карточку подробностей данными дедлайна
function fillDetail(task) {
    const meta = subjectMeta(task.subject);
    const icon = document.getElementById('detailIcon');
    icon.textContent = meta.icon;
    icon.style.backgroundColor = meta.color;

    document.getElementById('detailSubject').textContent = task.subject;
    document.getElementById('detailTitle').textContent = task.title || 'Без названия';
    document.getElementById('detailDate').textContent =
        formatDateFull(task.date) + ', ' + task.time;

    const status = statusFor(daysLeft(task.date));
    let statusText = status.text;

    if (task.status === 'done') {
        statusText = 'Выполнено';
    } else if (task.status === 'progress') {
        statusText = 'В работе · ' + status.text;
    }

    document.getElementById('detailStatus').textContent = statusText;

    const notesRow = document.getElementById('detailNotesRow');
    if (task.notes) {
        notesRow.style.display = '';
        document.getElementById('detailNotes').textContent = task.notes;
    } else {
        notesRow.style.display = 'none';
    }

    document.getElementById('detailDone').textContent =
        task.status === 'done' ? 'Вернуть в план' : 'Отметить выполненным';

    document.getElementById('detailProgress').textContent =
        task.status === 'progress' ? 'Убрать из работы' : 'Взять в работу';
}

function openDetail(task) {
    openedTask = task;
    fillDetail(task);
    document.getElementById('screen-detail').classList.add('is-open');
}

function closeDetail() {
    document.getElementById('screen-detail').classList.remove('is-open');
    openedTask = null;
}


// ---------- 14. Добавление и редактирование ----------

function fillSubjectSuggestions() {
    const datalist = document.getElementById('subjectsDatalist');
    const names = [];

    for (let task of tasks) {
        if (!names.includes(task.subject)) {
            names.push(task.subject);
        }
    }

    datalist.innerHTML = '';

    for (let name of names) {
        const option = document.createElement('option');
        option.value = name;
        datalist.appendChild(option);
    }
}

function openAdd(prefillSubject) {
    previousScreen = currentScreenName();
    editingTaskId = null;

    fillSubjectSuggestions();

    document.getElementById('addFormTitle').textContent = 'Добавить дедлайн';
    document.getElementById('addForm').reset();
    document.getElementById('addSubject').value = prefillSubject || '';
    document.getElementById('addDate').value = toKey(new Date());
    document.getElementById('addTime').value = deadlineDefaultTime();
    document.getElementById('screen-add').classList.add('is-open');
}

function openEdit(task) {
    previousScreen = currentScreenName();
    editingTaskId = task.id;

    fillSubjectSuggestions();

    document.getElementById('addFormTitle').textContent = 'Редактировать дедлайн';
    document.getElementById('addSubject').value = task.subject;
    document.getElementById('addTitle').value = task.title;
    document.getElementById('addDate').value = task.date;
    document.getElementById('addTime').value = task.time;
    document.getElementById('addNotes').value = task.notes;

    closeDetail();
    document.getElementById('screen-add').classList.add('is-open');
}

function closeAdd() {
    document.getElementById('screen-add').classList.remove('is-open');
}

function addTask(event) {
    event.preventDefault();

    const subjectInput = document.getElementById('addSubject');
    const titleInput = document.getElementById('addTitle');
    const dateInput = document.getElementById('addDate');
    const timeInput = document.getElementById('addTime');
    const notesInput = document.getElementById('addNotes');

    const title = titleInput.value.trim();
    const date = dateInput.value;
    const time = timeInput.value || deadlineDefaultTime();
    const notes = notesInput.value.trim();

    // Нецензурная лексика — не сохраняем и показываем сообщение
    if (hasBadWords(subjectInput.value) || hasBadWords(title) || hasBadWords(notes)) {
        alert('извините, но разработчики запретили нецензурную лексику 💔');
        return;
    }

    // Проверяем название предмета
    const check = checkSubject(subjectInput.value);

    if (check.error) {
        alert(check.error);
        return;
    }

    if (date === '') {
        alert('Выбери дату дедлайна 🙂');
        return;
    }

    if (title.length > 120) {
        alert('Название задания слишком длинное — максимум 120 символов');
        return;
    }

    // Шутливое слово — спрашиваем, но не запрещаем
    const funnyWord = findFunnyWord(check.name);

    if (funnyWord) {
        if (!confirm('«' + funnyWord + '»? Точно сохраняем такой предмет???')) {
            return;
        }
    }

    // Подозрительное название спрашиваем, но не запрещаем
    if (check.warning) {
        if (!confirm('Название предмета «' + check.name + '» выглядит странно. Точно сохранить?')) {
            return;
        }
    }

    if (editingTaskId !== null) {
        const task = tasks.find(function (item) {
            return item.id === editingTaskId;
        });

        if (task) {
            task.subject = check.name;
            task.title = title;
            task.date = date;
            task.time = time;
            task.notes = notes;
        }
    } else {
        tasks.push({
            id: 'id-' + Date.now(),
            subject: check.name,
            title: title,
            date: date,
            time: time,
            notes: notes,
            status: 'todo'
        });
    }

    saveTasks();

    document.getElementById('addForm').reset();
    editingTaskId = null;

    closeAdd();
    showScreen(previousScreen);
    refresh();
}


// ---------- 15. Обработчики событий ----------

// Переключение между вопросами персонализации
function showQuizStep(index) {
    quizStepIndex = index;

    document.getElementById('quizStep').textContent = 'Вопрос ' + (index + 1) + ' из 2';
    document.getElementById('quizName').classList.toggle('is-hidden', index !== 0);
    document.getElementById('quizTime').classList.toggle('is-hidden', index !== 1);
    document.getElementById('quizNext').textContent = index === 1 ? 'готово' : 'далее';
}

document.querySelectorAll('.nav__item').forEach(function (button) {
    button.addEventListener('click', function () {
        showScreen(button.dataset.screen);
    });
});

document.getElementById('deadlineFilters').addEventListener('click', function (event) {
    const chip = event.target.closest('.chip');
    if (!chip) return;

    deadlineFilter = chip.dataset.filter;

    document.querySelectorAll('#deadlineFilters .chip').forEach(function (item) {
        item.classList.toggle('is-active', item.dataset.filter === deadlineFilter);
    });

    renderDeadlines();
});

document.getElementById('fab').addEventListener('click', function () {
    openAdd();
});

document.getElementById('addClose').addEventListener('click', closeAdd);
document.getElementById('addForm').addEventListener('submit', addTask);

document.getElementById('calPrev').addEventListener('click', function () {
    calendarDate = new Date(calendarDate.getFullYear(), calendarDate.getMonth() - 1, 1);
    renderCalendar();
});

document.getElementById('calNext').addEventListener('click', function () {
    calendarDate = new Date(calendarDate.getFullYear(), calendarDate.getMonth() + 1, 1);
    renderCalendar();
});

document.getElementById('searchInput').addEventListener('input', function (event) {
    searchQuery = event.target.value;
    renderHome();
});

// Подробности: закрыть, статусы, редактирование, удаление
document.getElementById('detailClose').addEventListener('click', closeDetail);

// Меняем статус и остаёмся в карточке — так видно, что произошло
document.getElementById('detailDone').addEventListener('click', function () {
    if (!openedTask) return;

    openedTask.status = openedTask.status === 'done' ? 'todo' : 'done';

    saveTasks();
    refresh();
    fillDetail(openedTask);
});

document.getElementById('detailProgress').addEventListener('click', function () {
    if (!openedTask) return;

    openedTask.status = openedTask.status === 'progress' ? 'todo' : 'progress';

    saveTasks();
    refresh();
    fillDetail(openedTask);
});

document.getElementById('detailEdit').addEventListener('click', function () {
    if (!openedTask) return;
    openEdit(openedTask);
});

document.getElementById('detailDelete').addEventListener('click', function () {
    if (!openedTask) return;

    const id = openedTask.id;
    tasks = tasks.filter(function (item) {
        return item.id !== id;
    });

    saveTasks();
    closeDetail();
    refresh();
});

// Кнопка "начать" — открываем вопросы персонализации
document.getElementById('startBtn').addEventListener('click', function () {
    document.getElementById('nameInput').value = getName();
    document.getElementById('startTime').value = getFirstClassTime();
    showQuizStep(0);
    document.getElementById('onboarding').classList.add('is-hidden');
    document.getElementById('quiz').classList.remove('is-hidden');
});

// "далее" / "готово" на шагах персонализации
document.getElementById('quizNext').addEventListener('click', function () {
    if (quizStepIndex === 0) {
        const name = document.getElementById('nameInput').value.trim();

        if (name === '') {
            alert('Напиши, как тебя зовут 🙂');
            return;
        }

        localStorage.setItem(NAME_KEY, name);
        showQuizStep(1);
        return;
    }

    const startTime = document.getElementById('startTime').value;

    if (startTime) {
        localStorage.setItem(FIRST_CLASS_KEY, startTime);
    }

    localStorage.setItem(ONBOARDING_KEY, 'true');
    document.getElementById('quiz').classList.add('is-hidden');
    refresh();
});

if (localStorage.getItem(ONBOARDING_KEY) === 'true') {
    document.getElementById('onboarding').classList.add('is-hidden');
}

// Настройки в профиле
document.getElementById('showOnboardingBtn').addEventListener('click', function () {
    document.getElementById('nameInput').value = getName();
    document.getElementById('startTime').value = getFirstClassTime();
    showQuizStep(0);
    document.getElementById('quiz').classList.add('is-hidden');
    document.getElementById('onboarding').classList.remove('is-hidden');
});

// Имя можно поменять в профиле
document.getElementById('settingsName').value = getName();
document.getElementById('settingsName').addEventListener('change', function (event) {
    localStorage.setItem(NAME_KEY, event.target.value.trim());
    renderHome();
});

// Время первой пары можно поменять в профиле
document.getElementById('startTime').value = getFirstClassTime();
document.getElementById('firstClassInput').value = getFirstClassTime();
document.getElementById('firstClassInput').addEventListener('change', function (event) {
    if (event.target.value) {
        localStorage.setItem(FIRST_CLASS_KEY, event.target.value);
    }
});

document.getElementById('clearPastBtn').addEventListener('click', function () {
    const past = tasks.filter(function (task) {
        return task.status !== 'done' && daysLeft(task.date) < 0;
    });

    if (past.length === 0) return;

    if (!confirm('Удалить прошедшие дедлайны: ' + past.length + '?')) return;

    tasks = tasks.filter(function (task) {
        return task.status === 'done' || daysLeft(task.date) >= 0;
    });

    saveTasks();
    refresh();
});


// ---------- 17. Первый запуск ----------

document.getElementById('appVersion').textContent = 'версия ' + APP_VERSION;

renderHome();
renderDeadlines();
renderCalendar();
renderSubjects();
renderProfile();
