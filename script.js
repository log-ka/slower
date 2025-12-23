// Required HTML structure:
// - Form with id "problem-form" and inputs/selects/textareas matching the constants below
// - Button with id "new-problem-button"
// - Container with id "status-message"
// - Container with id "problems-container"

const DB_NAME = "olympiad-thinking-log";
const DB_VERSION = 1;
const STORE_NAME = "problems";
const ID_SEPARATOR = "|";
const RESULT_VALUES = ["fail", "partial", "success"];

let databaseConnection = null;

document.addEventListener("DOMContentLoaded", () => {
    initializeApp().catch((error) => {
        renderStatus(`Initialization failed: ${error.message}`, "error");
    });
});

async function initializeApp() {
    await openDatabase();
    const ui = getUiElements();
    attachFormHandler(ui);
    attachNewEntryHandler(ui);
    attachEditHandler(ui);
    await refreshProblems(ui);
}

function getUiElements() {
    return {
        form: document.getElementById("problem-form"),
        fields: {
            id: document.getElementById("problem-id"),
            title: document.getElementById("problem-title"),
            olympiad: document.getElementById("source-olympiad"),
            year: document.getElementById("source-year"),
            stage: document.getElementById("source-stage"),
            classLevel: document.getElementById("source-class"),
            topics: document.getElementById("metadata-topics"),
            keyProperty: document.getElementById("metadata-key"),
            status: document.getElementById("solution-status"),
            idea: document.getElementById("solution-idea"),
            failure: document.getElementById("solution-failure"),
            finalSolution: document.getElementById("solution-final"),
            mistakes: document.getElementById("solution-mistakes"),
            insights: document.getElementById("solution-insights"),
            attempts: document.getElementById("attempts-log")
        },
        status: document.getElementById("status-message"),
        problemsContainer: document.getElementById("problems-container"),
        newEntryButton: document.getElementById("new-problem-button")
    };
}

function renderStatus(message, type = "info") {
    const statusElement = document.getElementById("status-message");
    if (!statusElement) {
        return;
    }
    statusElement.textContent = message;
    statusElement.dataset.type = type;
}

async function openDatabase() {
    if (databaseConnection) {
        return databaseConnection;
    }

    databaseConnection = await new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME, { keyPath: "id" });
            }
        };

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(new Error("Could not open IndexedDB"));
    });

    return databaseConnection;
}

function getStore(mode) {
    if (!databaseConnection) {
        throw new Error("Database not initialized");
    }
    return databaseConnection
        .transaction(STORE_NAME, mode)
        .objectStore(STORE_NAME);
}

function toPromise(request) {
    return new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error || new Error("Request failed"));
    });
}

async function saveProblem(problem) {
    const store = getStore("readwrite");
    const request = store.put(problem);
    await toPromise(request);
    return problem.id;
}

async function fetchAllProblems() {
    const store = getStore("readonly");
    return toPromise(store.getAll());
}

async function fetchProblemById(id) {
    const store = getStore("readonly");
    return toPromise(store.get(id));
}

function attachFormHandler(ui) {
    ui.form.addEventListener("submit", async (event) => {
        event.preventDefault();
        try {
            const problem = buildProblemFromFields(ui.fields);
            await saveProblem(problem);
            renderStatus(`Saved problem ${problem.id}`, "success");
            await refreshProblems(ui);
        } catch (error) {
            renderStatus(error.message, "error");
        }
    });
}

function attachNewEntryHandler(ui) {
    ui.newEntryButton.addEventListener("click", () => {
        clearForm(ui.fields);
        renderStatus("Ready for new entry", "info");
    });
}

function attachEditHandler(ui) {
    ui.problemsContainer.addEventListener("click", async (event) => {
        const editButton = event.target.closest("button[data-problem-id]");
        if (!editButton) {
            return;
        }
        const problemId = editButton.dataset.problemId;
        try {
            const problem = await fetchProblemById(problemId);
            if (!problem) {
                renderStatus(`Problem ${problemId} not found`, "error");
                return;
            }
            populateForm(ui.fields, problem);
            renderStatus(`Loaded ${problem.id} for editing`, "info");
            ui.fields.title.focus();
        } catch (error) {
            renderStatus(error.message, "error");
        }
    });
}

async function refreshProblems(ui) {
    const problems = await fetchAllProblems();
    renderProblems(ui.problemsContainer, problems);
}

function buildProblemFromFields(fields) {
    const id = fields.id.value.trim();
    const title = fields.title.value.trim();
    const olympiad = fields.olympiad.value.trim();
    const stage = fields.stage.value.trim();
    const keyProperty = fields.keyProperty.value.trim();
    const ideaInitial = fields.idea.value.trim();
    const whereFailed = fields.failure.value.trim();
    const finalSolution = fields.finalSolution.value.trim();

    if (!id) {
        throw new Error("Problem id is required");
    }
    if (!title) {
        throw new Error("Title is required");
    }
    if (!olympiad) {
        throw new Error("Olympiad is required");
    }

    const year = Number.parseInt(fields.year.value, 10);
    const classLevel = Number.parseInt(fields.classLevel.value, 10);

    if (Number.isNaN(year)) {
        throw new Error("Year must be a number");
    }
    if (Number.isNaN(classLevel)) {
        throw new Error("Class must be a number");
    }

    const status = fields.status.value;
    if (!["unsolved", "partial", "solved"].includes(status)) {
        throw new Error("Invalid solution status");
    }

    const topics = parseList(fields.topics.value);
    const mistakes = parseList(fields.mistakes.value);
    const insights = parseList(fields.insights.value);
    const attempts = parseAttempts(fields.attempts.value);

    return {
        id,
        title,
        source: {
            olympiad,
            year,
            stage,
            class: classLevel
        },
        metadata: {
            topics,
            key_property: keyProperty
        },
        solution: {
            status,
            idea_initial: ideaInitial,
            where_failed: whereFailed,
            final_solution: finalSolution,
            mistakes,
            insights
        },
        attempts
    };
}

function parseList(value) {
    return value
        .split(",")
        .map((item) => item.trim())
        .filter((item) => item.length > 0);
}

function parseAttempts(value) {
    const trimmed = value.trim();
    if (!trimmed) {
        return [];
    }
    return trimmed.split("\n").reduce((accumulator, line) => {
        const cleanLine = line.trim();
        if (!cleanLine) {
            return accumulator;
        }
        const [datePart, resultPart] = cleanLine.split(ID_SEPARATOR).map((part) => part.trim());
        if (!datePart || !resultPart) {
            return accumulator;
        }
        if (!RESULT_VALUES.includes(resultPart)) {
            return accumulator;
        }
        accumulator.push({ date: datePart, result: resultPart });
        return accumulator;
    }, []);
}

function populateForm(fields, problem) {
    fields.id.value = problem.id;
    fields.title.value = problem.title;
    fields.olympiad.value = problem.source.olympiad;
    fields.year.value = problem.source.year;
    fields.stage.value = problem.source.stage;
    fields.classLevel.value = problem.source.class;
    fields.topics.value = formatList(problem.metadata.topics);
    fields.keyProperty.value = problem.metadata.key_property;
    fields.status.value = problem.solution.status;
    fields.idea.value = problem.solution.idea_initial;
    fields.failure.value = problem.solution.where_failed;
    fields.finalSolution.value = problem.solution.final_solution;
    fields.mistakes.value = formatList(problem.solution.mistakes);
    fields.insights.value = formatList(problem.solution.insights);
    fields.attempts.value = formatAttempts(problem.attempts);
}

function clearForm(fields) {
    fields.id.value = "";
    fields.title.value = "";
    fields.olympiad.value = "";
    fields.year.value = "";
    fields.stage.value = "";
    fields.classLevel.value = "";
    fields.topics.value = "";
    fields.keyProperty.value = "";
    fields.status.value = "unsolved";
    fields.idea.value = "";
    fields.failure.value = "";
    fields.finalSolution.value = "";
    fields.mistakes.value = "";
    fields.insights.value = "";
    fields.attempts.value = "";
}

function formatList(list) {
    return (list || []).join(", ");
}

function formatAttempts(attempts) {
    return (attempts || [])
        .map((attempt) => `${attempt.date} ${ID_SEPARATOR} ${attempt.result}`)
        .join("\n");
}

function renderProblems(container, problems) {
    container.innerHTML = "";
    if (!problems || problems.length === 0) {
        container.textContent = "No problems saved yet.";
        return;
    }
    problems.forEach((problem) => {
        const card = document.createElement("article");
        card.classList.add("problem-card");

        const title = document.createElement("h3");
        title.textContent = `${problem.title} (${problem.id})`;
        card.appendChild(title);

        card.appendChild(renderDefinitionList([
            ["Olympiad", problem.source.olympiad],
            ["Year", String(problem.source.year)],
            ["Stage", problem.source.stage],
            ["Class", String(problem.source.class)],
            ["Topics", formatList(problem.metadata.topics)],
            ["Key property", problem.metadata.key_property]
        ]));

        card.appendChild(renderDefinitionList([
            ["Status", problem.solution.status],
            ["Initial idea", problem.solution.idea_initial],
            ["Where failed", problem.solution.where_failed],
            ["Final solution", problem.solution.final_solution],
            ["Mistakes", formatList(problem.solution.mistakes)],
            ["Insights", formatList(problem.solution.insights)]
        ]));

        const attemptsSection = document.createElement("div");
        const attemptsTitle = document.createElement("h4");
        attemptsTitle.textContent = "Attempts";
        attemptsSection.appendChild(attemptsTitle);

        const attemptsList = document.createElement("ul");
        if (problem.attempts.length === 0) {
            const emptyItem = document.createElement("li");
            emptyItem.textContent = "No attempts recorded";
            attemptsList.appendChild(emptyItem);
        } else {
            problem.attempts.forEach((attempt) => {
                const item = document.createElement("li");
                item.textContent = `${attempt.date}: ${attempt.result}`;
                attemptsList.appendChild(item);
            });
        }
        attemptsSection.appendChild(attemptsList);
        card.appendChild(attemptsSection);

        const editButton = document.createElement("button");
        editButton.type = "button";
        editButton.dataset.problemId = problem.id;
        editButton.textContent = "Load for editing";
        card.appendChild(editButton);

        container.appendChild(card);
    });
}

function renderDefinitionList(entries) {
    const list = document.createElement("dl");
    entries.forEach(([label, value]) => {
        const term = document.createElement("dt");
        term.textContent = label;
        const description = document.createElement("dd");
        description.textContent = value || "—";
        list.appendChild(term);
        list.appendChild(description);
    });
    return list;
}
