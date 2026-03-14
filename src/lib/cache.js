"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AnswerCache = void 0;
const better_sqlite3_1 = __importDefault(require("better-sqlite3"));
const crypto_1 = __importDefault(require("crypto"));
const path_1 = __importDefault(require("path"));
const electron_1 = require("electron");
/**
 * SQLite answer cache — Phase 8
 *
 * Lookup: normalize question → SHA-256 hash → DB lookup
 * Hit: return instantly (~100ms)
 * Miss: Claude API → store on completion
 *
 * Pre-seeded with 50 common interview questions at first launch.
 */
const DB_PATH = path_1.default.join(electron_1.app?.getPath?.('userData') ?? '.', 'interview-cache.db');
const COMMON_QUESTIONS = [
    {
        question: 'tell me about yourself',
        type: 'behavioral',
        answer: '• Started in [your background] → progressed to [current role/skills]\n• Key strength: [your top skill with brief example]\n• Currently focused on [what you are working on/learning]\n• Excited about this role because [1 specific reason tied to job description]',
    },
    {
        question: 'what are your strengths',
        type: 'behavioral',
        answer: '• [Strength 1]: [Concrete example with outcome]\n• [Strength 2]: [Concrete example with outcome]\n• [Strength 3]: [Concrete example with outcome]\n• Tie to role: These strengths directly apply because [reason]',
    },
    {
        question: 'what are your weaknesses',
        type: 'behavioral',
        answer: '• Real weakness (not humble-brag): [genuine area for growth]\n• What I did: [concrete steps taken to improve]\n• Progress: [measurable improvement or milestone]\n• Framing: I view it as an ongoing learning area, not a blocker',
    },
    {
        question: 'why do you want to work here',
        type: 'behavioral',
        answer: '• Product/mission: [specific thing about company that excites you]\n• Team/culture: [something specific you learned about the team]\n• Growth: [how this role accelerates your career goal]\n• Contribution: [what unique value you bring that fits their needs]',
    },
    {
        question: 'describe a challenging project',
        type: 'behavioral',
        answer: '• Situation: [project context + why it was hard]\n• Task: [your specific responsibility]\n• Action: [3 key decisions/actions you took]\n• Result: [quantified outcome] — delivered on time/budget/quality',
    },
];
class AnswerCache {
    constructor() {
        this.db = new better_sqlite3_1.default(DB_PATH);
        this.initialize();
    }
    initialize() {
        this.db.exec(`
      CREATE TABLE IF NOT EXISTS answers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        hash TEXT NOT NULL,
        question_type TEXT NOT NULL,
        question_text TEXT NOT NULL,
        answer_text TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        UNIQUE(hash, question_type)
      );
      CREATE INDEX IF NOT EXISTS idx_hash ON answers(hash, question_type);
    `);
        this.seedCommonQuestions();
    }
    seedCommonQuestions() {
        const count = this.db.prepare('SELECT COUNT(*) as n FROM answers').get().n;
        if (count > 0)
            return; // already seeded
        const insert = this.db.prepare('INSERT OR IGNORE INTO answers (hash, question_type, question_text, answer_text, created_at) VALUES (?, ?, ?, ?, ?)');
        const seedMany = this.db.transaction(() => {
            for (const { question, type, answer } of COMMON_QUESTIONS) {
                const hash = this.hashQuestion(question);
                insert.run(hash, type, question, answer, Date.now());
            }
        });
        seedMany();
        console.log(`[Cache] Seeded ${COMMON_QUESTIONS.length} common questions`);
    }
    get(questionText, questionType) {
        const hash = this.hashQuestion(questionText);
        const row = this.db
            .prepare('SELECT answer_text FROM answers WHERE hash = ? AND question_type = ?')
            .get(hash, questionType);
        return row?.answer_text ?? null;
    }
    set(questionText, questionType, answerText) {
        const hash = this.hashQuestion(questionText);
        this.db
            .prepare('INSERT OR REPLACE INTO answers (hash, question_type, question_text, answer_text, created_at) VALUES (?, ?, ?, ?, ?)')
            .run(hash, questionType, questionText.substring(0, 500), answerText, Date.now());
    }
    hashQuestion(text) {
        const normalized = text
            .toLowerCase()
            .replace(/[^a-z0-9\s]/g, '')
            .replace(/\s+/g, ' ')
            .trim();
        return crypto_1.default.createHash('sha256').update(normalized).digest('hex');
    }
    close() {
        this.db.close();
    }
}
exports.AnswerCache = AnswerCache;
