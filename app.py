from flask import Flask, render_template, request, redirect, session, flash, jsonify, get_flashed_messages, url_for
from flask_sqlalchemy import SQLAlchemy
from flask_bcrypt import Bcrypt
from functools import wraps
from datetime import datetime, timedelta
import json
import os
import hashlib
import sqlite3
import requests
import time
import secrets
from threading import Lock
from werkzeug.utils import secure_filename
from flask_mail import Mail, Message
from reportlab.lib.pagesizes import letter, A4
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
from reportlab.lib import colors
from io import BytesIO

# Initialize Flask app
app = Flask(__name__)

# ─────────────────────────────────────────
#  CONFIGURATION
# ─────────────────────────────────────────

app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///shikshasetu.db'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
app.config['SECRET_KEY'] = os.environ.get('SECRET_KEY', '5a746e67ab7b9a6de99c648b9a329cd7718975d0289452792a64ff58ebf6f709')
app.config['PERMANENT_SESSION_LIFETIME'] = timedelta(days=7)

# Translation system configuration
app.config['DATABASE_PATH'] = 'translations_shiksha.db'
app.config['ORIGINAL_TEXTS_PATH'] = 'original_texts_shiksha.json'
app.config['LANGUAGE_CODES'] = {
    'en': 'en',
    'kn': 'kn',
    'hi': 'hi',
    'ml': 'ml'
}
app.config['LANGUAGE_NAMES'] = {
    'en': 'English',
    'kn': 'ಕನ್ನಡ',
    'hi': 'हिन्दी',
    'ml': 'മലയാളം'
}

# Email configuration
app.config['MAIL_SERVER'] = 'smtp.gmail.com'
app.config['MAIL_PORT'] = 587
app.config['MAIL_USE_TLS'] = True
app.config['MAIL_USE_SSL'] = False
app.config['MAIL_USERNAME'] = os.environ.get('MAIL_USERNAME', 'goatrip07to11@gmail.com')
app.config['MAIL_PASSWORD'] = os.environ.get('MAIL_PASSWORD', 'puxrhbguzmxnvudc')
app.config['MAIL_DEFAULT_SENDER'] = app.config['MAIL_USERNAME']
mail = Mail(app)

# Password reset configuration
app.config['PASSWORD_RESET_TIMEOUT'] = 3600

# File upload configuration
app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024
app.config['UPLOAD_FOLDER'] = 'uploads'

# Initialize extensions
db = SQLAlchemy(app)
bcrypt = Bcrypt(app)

# Ensure directories exist
os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)
os.makedirs('static/js', exist_ok=True)
os.makedirs('static/css', exist_ok=True)
os.makedirs('templates', exist_ok=True)

# ─────────────────────────────────────────
#  MODELS
# ─────────────────────────────────────────

class User(db.Model):
    __tablename__ = 'user'
    
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    email = db.Column(db.String(120), unique=True, nullable=False)
    password = db.Column(db.String(200), nullable=False)
    role = db.Column(db.String(20), nullable=False, default='student')
    grade = db.Column(db.Integer, nullable=True)
    xp = db.Column(db.Integer, default=0)
    level = db.Column(db.Integer, default=1)
    preferred_language = db.Column(db.String(10), default='en')
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    last_login = db.Column(db.DateTime, nullable=True)
    is_active = db.Column(db.Boolean, default=True)
    reset_token = db.Column(db.String(100), nullable=True, unique=True)
    reset_token_expiry = db.Column(db.DateTime, nullable=True)
    parent_email = db.Column(db.String(120), nullable=True)

    sessions = db.relationship('GameSession', backref='user', lazy=True, cascade='all, delete-orphan')

    def __repr__(self):
        return f'<User {self.name} | {self.role} | Grade {self.grade} | Level {self.level}>'

    def to_dict(self):
        return {
            'id': self.id,
            'name': self.name,
            'email': self.email,
            'role': self.role,
            'grade': self.grade,
            'xp': self.xp,
            'level': self.level,
            'preferred_language': self.preferred_language,
            'parent_email': self.parent_email
        }


class GameSession(db.Model):
    __tablename__ = 'game_session'
    
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id', ondelete='CASCADE'), nullable=False)
    subject = db.Column(db.String(50), nullable=False)
    grade = db.Column(db.Integer, nullable=True)
    score = db.Column(db.Integer, default=0)
    xp_earned = db.Column(db.Integer, default=0)
    played_at = db.Column(db.DateTime, default=datetime.utcnow)
    duration = db.Column(db.Integer, default=0)
    accuracy = db.Column(db.Float, default=0.0)

    def __repr__(self):
        return f'<GameSession {self.subject} | Gr{self.grade} | {self.xp_earned} XP>'


# ─────────────────────────────────────────
#  SUBJECT CONFIGURATION (MERGED - includes Java & HTML)
# ─────────────────────────────────────────

GRADE_SUBJECTS = {
    6: ["Physics", "Chemistry", "Biology", "Mathematics"],
    7: ["Physics", "Chemistry", "Biology", "Mathematics", "Python", "HTML"],
    8: ["Physics", "Chemistry", "Biology", "Mathematics", "Python", "Java", "HTML"],
    9: ["Physics", "Chemistry", "Biology", "Mathematics", "Python", "Java", "HTML"],
    10: ["Physics", "Chemistry", "Biology", "Mathematics", "Python", "Java", "HTML"],
    11: ["Physics", "Chemistry", "Biology", "Mathematics", "Python", "Java", "HTML"],
    12: ["Physics", "Chemistry", "Biology", "Mathematics", "Python", "Java", "HTML"],
}

VALID_SUBJECTS = {
    "physics", "chemistry", "biology",
    "mathematics", "math", "maths",
    "python", "coding", "computer science",
    "java", "html", "html/css"
}

# ─────────────────────────────────────────
#  HELPER FUNCTIONS
# ─────────────────────────────────────────

def update_level(user):
    """Update user level based on XP"""
    old_level = user.level
    user.level = min(100, (user.xp // 500) + 1)
    if user.level > old_level:
        flash(f'🎉 Level Up! You are now level {user.level}!', 'success')


def get_current_user():
    """Get current user from session"""
    if 'user_id' not in session:
        return None
    try:
        return User.query.get(session['user_id'])
    except:
        return None


def get_subjects_for_grade(grade):
    """Return subject list for a given grade"""
    try:
        g = int(grade) if grade else 6
        return GRADE_SUBJECTS.get(g, GRADE_SUBJECTS[6])
    except (TypeError, ValueError):
        return GRADE_SUBJECTS[6]


def get_locale():
    """Get current language from session or user preference"""
    if 'language' in session:
        return session['language']
    user = get_current_user()
    if user and user.preferred_language:
        return user.preferred_language
    return 'en'


def generate_reset_token():
    """Generate a secure random token"""
    return secrets.token_urlsafe(32)


def validate_email(email):
    """Basic email validation"""
    import re
    pattern = r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'
    return re.match(pattern, email) is not None


def sanitize_input(text):
    """Basic input sanitization"""
    if not text:
        return text
    import re
    return re.sub(r'<[^>]*>', '', text)


# ── Auth decorators ──────────────────────

def login_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        if 'user_id' not in session:
            flash('Please log in first to access this page.', 'warning')
            return redirect(url_for('login'))
        user = get_current_user()
        if not user or not user.is_active:
            session.clear()
            flash('Account not found or deactivated.', 'error')
            return redirect(url_for('login'))
        return f(*args, **kwargs)
    return decorated


def student_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        if 'user_id' not in session:
            return redirect(url_for('login'))
        user = get_current_user()
        if not user or not user.is_active:
            session.clear()
            flash('Account not found.', 'error')
            return redirect(url_for('login'))
        if session.get('role') != 'student':
            flash('This page is for students only.', 'error')
            return redirect(url_for('teacher_dashboard'))
        return f(*args, **kwargs)
    return decorated


def teacher_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        if 'user_id' not in session:
            return redirect(url_for('login'))
        user = get_current_user()
        if not user or not user.is_active:
            session.clear()
            flash('Account not found.', 'error')
            return redirect(url_for('login'))
        if session.get('role') != 'teacher':
            flash('This page is for teachers only.', 'error')
            return redirect(url_for('student_dashboard'))
        return f(*args, **kwargs)
    return decorated


# ─────────────────────────────────────────
#  TRANSLATION SYSTEM
# ─────────────────────────────────────────

class TextManager:
    def __init__(self, file_path):
        self.file_path = file_path
        self.lock = Lock()
        self._init_file()
    
    def _init_file(self):
        """Initialize the original texts file"""
        try:
            if not os.path.exists(self.file_path):
                with self.lock:
                    with open(self.file_path, 'w', encoding='utf-8') as f:
                        json.dump({}, f)
        except Exception as e:
            print(f"⚠️ TextManager init error: {e}")
    
    def save_original_texts(self, page_url, texts):
        """Save original English texts for a page"""
        try:
            with self.lock:
                data = {}
                if os.path.exists(self.file_path):
                    with open(self.file_path, 'r', encoding='utf-8') as f:
                        data = json.load(f)
                
                data[page_url] = texts
                
                with open(self.file_path, 'w', encoding='utf-8') as f:
                    json.dump(data, f, ensure_ascii=False, indent=2)
        except Exception as e:
            print(f"⚠️ Error saving original texts: {e}")
    
    def get_original_texts(self, page_url):
        """Get original English texts for a page"""
        try:
            with self.lock:
                if not os.path.exists(self.file_path):
                    return []
                with open(self.file_path, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                return data.get(page_url, [])
        except Exception as e:
            print(f"⚠️ Error getting original texts: {e}")
            return []


class FastTranslator:
    def __init__(self):
        self.executor = None
        self.session = requests.Session()
        self.session.headers.update({'User-Agent': 'ShikshaSetu/1.0'})
        
    def translate_batch_parallel(self, texts, target_lang):
        """Translate multiple texts in parallel"""
        import concurrent.futures
        
        if self.executor is None:
            self.executor = concurrent.futures.ThreadPoolExecutor(max_workers=5)
            
        def translate_single(text):
            return self._translate_single(text, target_lang)
            
        futures = [self.executor.submit(translate_single, text) for text in texts]
        
        results = []
        for i, future in enumerate(futures):
            try:
                results.append(future.result(timeout=10))
            except Exception as e:
                print(f"Translation failed for text {i}: {e}")
                results.append(texts[i])
                
        return results
    
    def _translate_single(self, text, target_lang):
        """Single translation with multiple fast fallbacks"""
        if not text or not text.strip() or target_lang == 'en':
            return text
            
        translators = [
            self._translate_google,
            self._translate_mymemory,
            self._translate_libre,
        ]
        
        for translator in translators:
            try:
                result = translator(text, target_lang)
                if result and result.strip() and result != text:
                    return result
                time.sleep(0.1)
            except Exception as e:
                print(f"Translator {translator.__name__} failed: {e}")
                continue
                
        return text
    
    def _translate_google(self, text, target_lang):
        """Google Translate API (unofficial)"""
        try:
            url = "https://translate.googleapis.com/translate_a/single"
            params = {
                'client': 'gtx',
                'sl': 'auto',
                'tl': target_lang,
                'dt': 't',
                'q': text[:5000]
            }
            response = self.session.get(url, params=params, timeout=5)
            if response.status_code == 200:
                result = response.json()
                return result[0][0][0]
        except:
            pass
        return None
    
    def _translate_mymemory(self, text, target_lang):
        """MyMemory Translation API"""
        try:
            url = "https://api.mymemory.translated.net/get"
            params = {
                'q': text[:500],
                'langpair': f'auto|{target_lang}',
            }
            response = self.session.get(url, params=params, timeout=5)
            if response.status_code == 200:
                result = response.json()
                return result['responseData']['translatedText']
        except:
            pass
        return None
    
    def _translate_libre(self, text, target_lang):
        """LibreTranslate public instance"""
        try:
            url = "https://translate.argosopentech.com/translate"
            data = {
                'q': text[:5000],
                'source': 'en',
                'target': target_lang,
                'format': 'text'
            }
            response = self.session.post(url, json=data, timeout=5)
            if response.status_code == 200:
                result = response.json()
                return result['translatedText']
        except:
            pass
        return None


class PreTranslator:
    def __init__(self, db_path):
        self.db_path = db_path
        self.lock = Lock()
        self.fast_translator = FastTranslator()
        self.text_manager = TextManager(app.config['ORIGINAL_TEXTS_PATH'])
        self._init_db()
    
    def _init_db(self):
        """Initialize the SQLite database"""
        try:
            with self.lock:
                conn = sqlite3.connect(self.db_path, timeout=10)
                conn.execute('''
                    CREATE TABLE IF NOT EXISTS translations (
                        text_hash TEXT PRIMARY KEY,
                        original_text TEXT,
                        target_lang TEXT,
                        translated_text TEXT,
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                    )
                ''')
                
                conn.execute('''
                    CREATE INDEX IF NOT EXISTS idx_hash_lang 
                    ON translations (text_hash, target_lang)
                ''')
                conn.commit()
                conn.close()
        except Exception as e:
            print(f"⚠️ Translation DB init error: {e}")
    
    def _get_text_hash(self, text, target_lang):
        """Generate a unique hash for text + language"""
        return hashlib.md5(f"{text}_{target_lang}".encode('utf-8')).hexdigest()
    
    def get_cached_translation(self, text, target_lang):
        """Get translation from cache"""
        try:
            text_hash = self._get_text_hash(text, target_lang)
            
            with self.lock:
                conn = sqlite3.connect(self.db_path, timeout=10)
                cursor = conn.cursor()
                cursor.execute(
                    'SELECT translated_text FROM translations WHERE text_hash = ?',
                    (text_hash,)
                )
                result = cursor.fetchone()
                conn.close()
                return result[0] if result else None
        except Exception as e:
            print(f"⚠️ Cache read error: {e}")
            return None
    
    def cache_translation(self, text, target_lang, translated_text):
        """Cache a translation"""
        if not text or not translated_text or text == translated_text:
            return
            
        try:
            text_hash = self._get_text_hash(text, target_lang)
            
            with self.lock:
                conn = sqlite3.connect(self.db_path, timeout=10)
                conn.execute(
                    'INSERT OR REPLACE INTO translations (text_hash, original_text, target_lang, translated_text) VALUES (?, ?, ?, ?)',
                    (text_hash, text, target_lang, translated_text)
                )
                conn.commit()
                conn.close()
        except Exception as e:
            print(f"⚠️ Cache write error: {e}")
    
    def translate_batch(self, texts, target_lang, page_url):
        """Translate a batch of texts with caching"""
        if target_lang == 'en':
            original_texts = self.text_manager.get_original_texts(page_url)
            if original_texts and len(original_texts) == len(texts):
                return original_texts
            else:
                return texts
        
        current_originals = self.text_manager.get_original_texts(page_url)
        if not current_originals:
            self.text_manager.save_original_texts(page_url, texts)
        
        results = []
        to_translate = []
        
        for text in texts:
            if not text or not text.strip():
                results.append(text)
                continue
                
            cached = self.get_cached_translation(text, target_lang)
            if cached:
                results.append(cached)
            else:
                results.append(None)
                to_translate.append(text)
        
        if to_translate:
            print(f"📝 Translating {len(to_translate)} texts to {target_lang}...")
            translated = self.fast_translator.translate_batch_parallel(to_translate, target_lang)
            
            for original, translated_text in zip(to_translate, translated):
                if translated_text and translated_text != original:
                    self.cache_translation(original, target_lang, translated_text)
            
            translate_index = 0
            for i in range(len(results)):
                if results[i] is None:
                    results[i] = translated[translate_index] if translate_index < len(translated) else texts[i]
                    translate_index += 1
        
        return results


# Initialize the translator
pre_translator = PreTranslator(app.config['DATABASE_PATH'])


# ─────────────────────────────────────────
#  PDF GENERATION & EMAIL FUNCTIONS (Enhanced from File 2)
# ─────────────────────────────────────────

def generate_student_progress_pdf(student):
    """Generate a comprehensive PDF with student's progress report"""
    buffer = BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=A4, topMargin=0.5*inch, bottomMargin=0.5*inch, 
                            leftMargin=0.5*inch, rightMargin=0.5*inch)
    styles = getSampleStyleSheet()
    
    title_style = ParagraphStyle(
        'TitleStyle',
        parent=styles['Heading1'],
        fontSize=24,
        textColor=colors.HexColor('#2D0B6B'),
        spaceAfter=20,
        alignment=1,
        fontName='Helvetica-Bold'
    )
    
    header_style = ParagraphStyle(
        'HeaderStyle',
        parent=styles['Heading2'],
        fontSize=14,
        textColor=colors.HexColor('#FFFFFF'),
        spaceAfter=12,
        backColor=colors.HexColor('#4B0082'),
        leftIndent=10,
        rightIndent=10,
        alignment=0
    )
    
    normal_style = ParagraphStyle(
        'NormalStyle',
        parent=styles['Normal'],
        fontSize=10,
        spaceAfter=6,
        fontName='Helvetica'
    )
    
    story = []
    
    all_sessions = GameSession.query.filter_by(user_id=student.id).all()
    total_games = len(all_sessions)
    total_xp_earned = sum(s.xp_earned or 0 for s in all_sessions)
    avg_score = total_xp_earned // total_games if total_games > 0 else 0
    best_score = max((s.score or 0 for s in all_sessions), default=0)
    
    # Get all subjects from GRADE_SUBJECTS based on student's grade
    available_subjects = GRADE_SUBJECTS.get(student.grade if student.grade else 6, GRADE_SUBJECTS[6])
    
    subject_stats = {}
    for subject in available_subjects:
        subject_stats[subject] = {
            'games': 0,
            'total_xp': 0,
            'best_score': 0
        }
    
    for session in all_sessions:
        subject = session.subject
        if subject not in subject_stats:
            subject_stats[subject] = {
                'games': 0,
                'total_xp': 0,
                'best_score': 0
            }
        
        subject_stats[subject]['games'] += 1
        subject_stats[subject]['total_xp'] += session.xp_earned or 0
        subject_stats[subject]['best_score'] = max(subject_stats[subject]['best_score'], session.score or 0)
    
    today = datetime.utcnow().date()
    week_ago = today - timedelta(days=7)
    month_ago = today - timedelta(days=30)
    
    weekly_sessions = [s for s in all_sessions if s.played_at.date() >= week_ago]
    monthly_sessions = [s for s in all_sessions if s.played_at.date() >= month_ago]
    
    weekly_xp = sum(s.xp_earned or 0 for s in weekly_sessions)
    monthly_xp = sum(s.xp_earned or 0 for s in monthly_sessions)
    weekly_games = len(weekly_sessions)
    monthly_games = len(monthly_sessions)
    
    dates_played = sorted(set(s.played_at.date() for s in all_sessions))
    current_streak = 0
    longest_streak = 0
    streak_count = 0
    
    for i, date in enumerate(dates_played):
        if i == 0:
            streak_count = 1
        else:
            if (date - dates_played[i-1]).days == 1:
                streak_count += 1
            else:
                longest_streak = max(longest_streak, streak_count)
                streak_count = 1
    
    longest_streak = max(longest_streak, streak_count)
    
    if today in dates_played:
        current_streak = 1
        temp_date = today
        while (temp_date - timedelta(days=1)) in dates_played:
            current_streak += 1
            temp_date -= timedelta(days=1)
    
    all_students = User.query.filter_by(role='student').order_by(User.xp.desc()).all()
    rank = next((i + 1 for i, u in enumerate(all_students) if u.id == student.id), len(all_students))
    total_students = len(all_students)
    
    xp_for_next = (student.level + 1) * 500
    xp_this_lvl = student.xp - (student.level - 1) * 500
    xp_pct = int((xp_this_lvl / 500) * 100) if xp_this_lvl > 0 else 0
    
    story.append(Paragraph("SHIKSHASETU COMPREHENSIVE PROGRESS REPORT", title_style))
    story.append(Spacer(1, 5))
    story.append(Paragraph(f"Generated on: {datetime.now().strftime('%d %B %Y at %I:%M %p')}", 
                          ParagraphStyle('DateStyle', parent=styles['Normal'], fontSize=9, textColor=colors.grey, alignment=1)))
    story.append(Spacer(1, 20))
    
    story.append(Paragraph("STUDENT INFORMATION", header_style))
    story.append(Spacer(1, 10))
    
    student_info_data = [
        ["Student Name:", student.name],
        ["Email Address:", student.email],
        ["Parent/Guardian Email:", student.parent_email or "Not provided"],
        ["Current Grade:", f"Grade {student.grade if student.grade else 6}"],
        ["Current Level:", f"Level {student.level}"],
        ["Total Experience Points:", f"{student.xp:,} XP"],
        ["Member Since:", student.created_at.strftime('%d %B %Y')],
        ["Global Ranking:", f"#{rank} of {total_students} students"],
    ]
    
    student_table = Table(student_info_data, colWidths=[2.5*inch, 3.5*inch])
    student_table.setStyle(TableStyle([
        ('FONT', (0, 0), (-1, -1), 'Helvetica', 10),
        ('BACKGROUND', (0, 0), (0, -1), colors.HexColor('#F3E5F5')),
        ('BACKGROUND', (1, 0), (1, -1), colors.HexColor('#FFFFFF')),
        ('TEXTCOLOR', (0, 0), (-1, -1), colors.black),
        ('ALIGN', (0, 0), (0, -1), 'LEFT'),
        ('ALIGN', (1, 0), (1, -1), 'LEFT'),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('BOX', (0, 0), (-1, -1), 1, colors.HexColor('#E1BEE7')),
        ('GRID', (0, 0), (-1, -1), 1, colors.HexColor('#E1BEE7')),
        ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'),
    ]))
    
    story.append(student_table)
    story.append(Spacer(1, 20))
    
    story.append(Paragraph("PERFORMANCE METRICS", header_style))
    story.append(Spacer(1, 10))
    
    metrics_data = [
        ["Total Games Played", str(total_games), "Total XP Earned", f"{total_xp_earned:,}"],
        ["Highest Score", str(best_score), "Average Score", str(avg_score)],
        ["Progress to Next Level", f"{xp_pct}%", "Current Streak", f"{current_streak} days"],
        ["Longest Streak", f"{longest_streak} days", "", ""],
    ]
    
    metrics_table = Table(metrics_data, colWidths=[1.8*inch, 1.3*inch, 1.8*inch, 1.3*inch])
    metrics_table.setStyle(TableStyle([
        ('FONT', (0, 0), (-1, -1), 'Helvetica', 10),
        ('BACKGROUND', (0, 0), (0, 0), colors.HexColor('#E8EAF6')),
        ('BACKGROUND', (2, 0), (2, 0), colors.HexColor('#E8EAF6')),
        ('BACKGROUND', (0, 1), (0, 1), colors.HexColor('#E8EAF6')),
        ('BACKGROUND', (2, 1), (2, 1), colors.HexColor('#E8EAF6')),
        ('BACKGROUND', (0, 2), (0, 2), colors.HexColor('#E8EAF6')),
        ('BACKGROUND', (2, 2), (2, 2), colors.HexColor('#E8EAF6')),
        ('BACKGROUND', (0, 3), (0, 3), colors.HexColor('#E8EAF6')),
        ('BACKGROUND', (2, 3), (2, 3), colors.HexColor('#E8EAF6')),
        ('ALIGN', (1, 0), (1, -1), 'CENTER'),
        ('ALIGN', (3, 0), (3, -1), 'CENTER'),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('BOX', (0, 0), (-1, -1), 1, colors.HexColor('#C5CAE9')),
        ('GRID', (0, 0), (-1, -1), 1, colors.HexColor('#C5CAE9')),
        ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'),
        ('FONTNAME', (2, 0), (2, -1), 'Helvetica-Bold'),
    ]))
    
    story.append(metrics_table)
    story.append(Spacer(1, 20))
    
    story.append(Paragraph("COMPLETE SUBJECT PERFORMANCE", header_style))
    story.append(Spacer(1, 10))
    
    subject_data = [["Subject", "Games", "XP Earned", "Best Score"]]
    
    for subject, stats in subject_stats.items():
        games_played = stats['games']
        total_xp_subj = stats['total_xp']
        best = stats['best_score'] if stats['best_score'] > 0 else total_xp_subj // max(games_played, 1)
        
        subject_data.append([
            subject,
            str(games_played),
            f"{total_xp_subj:,}",
            str(best)
        ])
    
    subject_table = Table(subject_data, colWidths=[1.8*inch, 1.5*inch, 1.8*inch, 1.8*inch])
    
    table_style = [
        ('FONT', (0, 0), (-1, -1), 'Helvetica', 10),
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#2D0B6B')),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('BOX', (0, 0), (-1, -1), 1, colors.HexColor('#2D0B6B')),
        ('GRID', (0, 0), (-1, -1), 1, colors.HexColor('#D1C4E9')),
    ]
    
    for i in range(1, len(subject_data)):
        if i % 2 == 0:
            table_style.append(('BACKGROUND', (0, i), (-1, i), colors.HexColor('#F3E5F5')))
        else:
            table_style.append(('BACKGROUND', (0, i), (-1, i), colors.HexColor('#FFFFFF')))
    
    subject_table.setStyle(TableStyle(table_style))
    
    story.append(subject_table)
    story.append(Spacer(1, 20))
    
    story.append(Paragraph("TIME-BASED PROGRESS", header_style))
    story.append(Spacer(1, 10))
    
    time_data = [
        ["Period", "Games Played", "XP Earned", "Status"],
        ["Last 7 Days", str(weekly_games), f"{weekly_xp:,}", "Active" if weekly_games > 0 else "Getting Started"],
        ["Last 30 Days", str(monthly_games), f"{monthly_xp:,}", "Steady" if monthly_games > 0 else "Getting Started"],
        ["All Time", str(total_games), f"{total_xp_earned:,}", "Complete"],
    ]
    
    time_table = Table(time_data, colWidths=[1.8*inch, 1.5*inch, 1.8*inch, 1.8*inch])
    time_table.setStyle(TableStyle([
        ('FONT', (0, 0), (-1, -1), 'Helvetica', 9),
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#4B0082')),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('BOX', (0, 0), (-1, -1), 1, colors.HexColor('#4B0082')),
        ('GRID', (0, 0), (-1, -1), 1, colors.HexColor('#CE93D8')),
        ('BACKGROUND', (0, 1), (-1, 1), colors.HexColor('#F3E5F5')),
        ('BACKGROUND', (0, 2), (-1, 2), colors.HexColor('#EDE7F6')),
        ('BACKGROUND', (0, 3), (-1, 3), colors.HexColor('#E8EAF6')),
    ]))
    
    story.append(time_table)
    story.append(Spacer(1, 20))
    
    story.append(Paragraph("PERSONALIZED LEARNING PATH", header_style))
    story.append(Spacer(1, 10))
    
    recommendations = []
    
    for subject, stats in subject_stats.items():
        if stats['games'] == 0:
            recommendations.append(f"• Start playing {subject} games to earn XP!")
        elif stats['games'] < 3:
            recommendations.append(f"• Play {3 - stats['games']} more {subject} games to unlock achievements!")
    
    if weekly_games == 0:
        recommendations.append("• Play at least one game today to start your streak!")
    elif weekly_games < 5:
        recommendations.append(f"• Play {5 - weekly_games} more games this week to maintain your streak!")
    
    if not recommendations:
        recommendations = ["• You're doing great! Keep playing to reach higher levels!"]
    
    for rec in recommendations[:5]:
        story.append(Paragraph(rec, normal_style))
    
    story.append(Spacer(1, 30))
    
    footer_style = ParagraphStyle(
        'FooterStyle',
        parent=styles['Normal'],
        fontSize=9,
        textColor=colors.HexColor('#757575'),
        alignment=1
    )
    
    story.append(Paragraph("Keep Learning, Keep Growing!", footer_style))
    story.append(Spacer(1, 5))
    story.append(Paragraph("Thank you for supporting your child's educational journey with ShikshaSetu", footer_style))
    story.append(Paragraph(f"Report generated: {datetime.now().strftime('%d %B %Y at %I:%M %p')}", footer_style))
    
    doc.build(story)
    
    pdf_content = buffer.getvalue()
    buffer.close()
    
    return pdf_content


def send_student_progress_email(student, teacher_name):
    """Send progress report email to parent"""
    try:
        if not student.parent_email:
            return False, "No parent email registered for this student."

        pdf_content = generate_student_progress_pdf(student)
        
        all_sessions = GameSession.query.filter_by(user_id=student.id).all()
        total_games = len(all_sessions)
        total_xp = sum(s.xp_earned or 0 for s in all_sessions)
        
        available_subjects = GRADE_SUBJECTS.get(student.grade if student.grade else 6, GRADE_SUBJECTS[6])
        subject_stats = {}
        
        for subject in available_subjects:
            subject_stats[subject] = {
                'games': 0,
                'xp': 0,
                'best': 0
            }
        
        for session in all_sessions:
            subject = session.subject
            if subject not in subject_stats:
                subject_stats[subject] = {
                    'games': 0,
                    'xp': 0,
                    'best': 0
                }
            subject_stats[subject]['games'] += 1
            subject_stats[subject]['xp'] += session.xp_earned or 0
            subject_stats[subject]['best'] = max(subject_stats[subject]['best'], session.score or 0)
        
        week_ago = datetime.utcnow() - timedelta(days=7)
        weekly_sessions = [s for s in all_sessions if s.played_at >= week_ago]
        weekly_xp = sum(s.xp_earned or 0 for s in weekly_sessions)
        weekly_games = len(weekly_sessions)
        
        all_students = User.query.filter_by(role='student').order_by(User.xp.desc()).all()
        rank = next((i + 1 for i, u in enumerate(all_students) if u.id == student.id), len(all_students))
        
        xp_this_lvl = student.xp - (student.level - 1) * 500
        xp_pct = int((xp_this_lvl / 500) * 100) if xp_this_lvl > 0 else 0
        
        subject_rows = ""
        subject_colors = {
            "Physics": "#E3F2FD",
            "Chemistry": "#E8F5E9",
            "Biology": "#FFF3E0",
            "Mathematics": "#FCE4EC",
            "Python": "#F3E5F5",
            "Java": "#FFE0B2",
            "HTML": "#E0F7FA"
        }
        
        for subject, stats in subject_stats.items():
            bg_color = subject_colors.get(subject, "#FAFAFA")
            games = stats['games']
            xp = stats['xp']
            best = stats['best'] if stats['best'] > 0 else xp // max(games, 1)
            
            subject_rows += f"""
            <tr style="background: {bg_color};">
                <td style="padding: 12px; border-bottom: 1px solid #E0E0E0;"><b>{subject}</b></td>
                <td style="padding: 12px; text-align: center; border-bottom: 1px solid #E0E0E0;"><span style="font-size: 20px; font-weight: bold; color: #2D0B6B;">{games}</span><br/><span style="font-size: 11px; color: #666;">games</span></td>
                <td style="padding: 12px; text-align: center; border-bottom: 1px solid #E0E0E0;"><span style="font-size: 18px; font-weight: bold; color: #FF8C00;">{xp:,}</span><br/><span style="font-size: 11px; color: #666;">XP</span></td>
                <td style="padding: 12px; text-align: center; border-bottom: 1px solid #E0E0E0;"><span style="font-size: 18px; font-weight: bold; color: #4CAF50;">{best}</span><br/><span style="font-size: 11px; color: #666;">best score</span></td>
            </tr>
            """
        
        recommendations_html = ""
        recommendations = []
        
        for subject, stats in subject_stats.items():
            if stats['games'] == 0:
                recommendations.append(f"🔬 Try <b>{subject}</b> - Complete 3 games to unlock achievements!")
            elif stats['games'] < 3:
                recommendations.append(f"📚 Practice <b>{subject}</b> - {3 - stats['games']} more games to go!")
        
        if weekly_games < 5:
            recommendations.append(f"🎯 Play {5 - weekly_games} more games this week to maintain your streak!")
        
        if not recommendations:
            recommendations = ["🌟 You're doing amazing! Try the next level for bigger challenges!"]
        
        for rec in recommendations[:4]:
            recommendations_html += f"""
            <li style="margin: 10px 0; padding: 8px; background: #FFF8E1; border-radius: 8px; list-style: none;">
                {rec}
            </li>
            """
        
        email_html = f"""
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>ShikshaSetu Progress Report - {student.name}</title>
    <style>
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
        body {{ font-family: 'Inter', 'Segoe UI', Arial, sans-serif; line-height: 1.6; margin: 0; padding: 0; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); }}
        .email-container {{ max-width: 900px; margin: 20px auto; background: white; border-radius: 24px; overflow: hidden; box-shadow: 0 20px 60px rgba(0,0,0,0.3); }}
        .header {{ background: linear-gradient(135deg, #2D0B6B 0%, #4B0082 100%); color: white; padding: 40px 30px; text-align: center; }}
        .header h1 {{ margin: 0; font-size: 32px; letter-spacing: -0.5px; }}
        .header p {{ margin: 10px 0 0; opacity: 0.9; font-size: 16px; }}
        .content {{ padding: 40px; }}
        .greeting {{ font-size: 18px; margin-bottom: 25px; color: #333; }}
        .stats-grid {{ display: grid; grid-template-columns: repeat(4, 1fr); gap: 20px; margin: 30px 0; }}
        .stat-card {{ background: linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%); padding: 20px; border-radius: 16px; text-align: center; box-shadow: 0 4px 15px rgba(0,0,0,0.1); }}
        .stat-value {{ font-size: 32px; font-weight: bold; color: #2D0B6B; margin: 10px 0; }}
        .stat-label {{ font-size: 12px; color: #666; text-transform: uppercase; letter-spacing: 1px; }}
        .section {{ margin: 40px 0; }}
        .section-title {{ font-size: 24px; font-weight: bold; color: #2D0B6B; margin-bottom: 20px; padding-bottom: 10px; border-bottom: 3px solid #FFD700; display: inline-block; }}
        .subject-table {{ width: 100%; border-collapse: collapse; background: white; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 15px rgba(0,0,0,0.1); }}
        .subject-table th {{ background: #2D0B6B; color: white; padding: 15px; font-weight: 600; }}
        .level-progress {{ background: linear-gradient(90deg, #FFD700, #FF8C00); height: 100%; border-radius: 10px; }}
        .recommendations {{ background: #F3E5F5; border-radius: 16px; padding: 20px; margin: 20px 0; }}
        .footer {{ background: #2D0B6B; color: white; text-align: center; padding: 30px; font-size: 13px; }}
        .rank-badge {{ display: inline-block; background: #FFD700; color: #2D0B6B; padding: 8px 20px; border-radius: 30px; font-weight: bold; margin: 10px 0; }}
        @media (max-width: 600px) {{
            .stats-grid {{ grid-template-columns: repeat(2, 1fr); }}
            .content {{ padding: 20px; }}
        }}
    </style>
</head>
<body>
    <div class="email-container">
        <div class="header">
            <h1>📊 ShikshaSetu Progress Report</h1>
            <p>Comprehensive Learning Analytics for {student.name}</p>
            <div class="rank-badge">🎯 Global Rank #{rank} of {len(all_students)} Students</div>
        </div>
        
        <div class="content">
            <div class="greeting">
                Dear Parent/Guardian,<br><br>
                Here is the comprehensive progress report for <strong>{student.name}</strong>. 
                Your child has been making excellent progress on ShikshaSetu!
            </div>
            
            <div class="stats-grid">
                <div class="stat-card">
                    <div class="stat-label">Current Level</div>
                    <div class="stat-value">{student.level}</div>
                    <div style="background: #E0E0E0; border-radius: 10px; height: 8px; margin-top: 10px; overflow: hidden;">
                        <div class="level-progress" style="width: {xp_pct}%; height: 100%;"></div>
                    </div>
                    <div style="font-size: 12px; margin-top: 5px;">{xp_this_lvl}/500 XP</div>
                </div>
                <div class="stat-card">
                    <div class="stat-label">Total XP</div>
                    <div class="stat-value">{student.xp:,}</div>
                    <div style="font-size: 12px;">+{total_xp} from games</div>
                </div>
                <div class="stat-card">
                    <div class="stat-label">Games Played</div>
                    <div class="stat-value">{total_games}</div>
                    <div style="font-size: 12px;">{weekly_games} this week</div>
                </div>
                <div class="stat-card">
                    <div class="stat-label">Global Rank</div>
                    <div class="stat-value">#{rank}</div>
                    <div style="font-size: 12px;">of {len(all_students)} students</div>
                </div>
            </div>
            
            <div class="section">
                <div class="section-title">📚 Complete Subject Performance</div>
                <table class="subject-table" cellpadding="0" cellspacing="0">
                    <thead>
                        <tr><th>Subject</th><th>Games</th><th>XP Earned</th><th>Best Score</th></tr>
                    </thead>
                    <tbody>
                        {subject_rows}
                    </tbody>
                </table>
            </div>
            
            <div class="recommendations">
                <div style="font-size: 20px; font-weight: bold; margin-bottom: 15px;">💡 Personalized Recommendations</div>
                <ul>
                    {recommendations_html}
                </ul>
            </div>
            
            <div style="text-align: center; margin-top: 30px;">
                <div style="display: inline-block; background: #FFD700; color: #2D0B6B; padding: 12px 30px; border-radius: 30px; font-weight: bold;">
                    📱 Continue Learning on ShikshaSetu
                </div>
            </div>
            
            <div style="margin-top: 30px; padding: 15px; background: #E3F2FD; border-radius: 12px; font-size: 14px; text-align: center;">
                <strong>📎 Attachment:</strong> A comprehensive PDF report with detailed analytics is attached.
            </div>
        </div>
        
        <div class="footer">
            <p><strong>ShikshaSetu Team</strong></p>
            <p>📧 For any queries, please contact: support@shikshasetu.com</p>
            <p style="margin-top: 15px; font-size: 11px;">© 2025 ShikshaSetu - Empowering Education Through Gamification</p>
        </div>
    </div>
</body>
</html>
"""
        
        msg = Message(
            subject=f"📊 ShikshaSetu Progress Report - {student.name} (Level {student.level} | Rank #{rank})",
            recipients=[student.parent_email],
            sender=app.config['MAIL_DEFAULT_SENDER']
        )
        
        msg.html = email_html
        msg.body = f"ShikshaSetu Progress Report for {student.name}\n\nPlease view the attached PDF for complete details.\n\nRank: #{rank} of {len(all_students)}\nTotal XP: {student.xp}\nLevel: {student.level}\nGames Played: {total_games}"
        
        msg.attach(
            filename=f"ShikshaSetu_Report_{student.name}_{datetime.now().strftime('%Y%m%d')}.pdf",
            content_type="application/pdf",
            data=pdf_content
        )
        
        mail.send(msg)
        return True, f"Progress report sent successfully to {student.parent_email}"
        
    except Exception as e:
        print(f"Error sending progress email: {str(e)}")
        return False, f"Failed to send email: {str(e)}"


# ─────────────────────────────────────────
#  ERROR HANDLERS
# ─────────────────────────────────────────

@app.errorhandler(404)
def not_found(e):
    return render_template('404.html', current_lang=get_locale()), 404


@app.errorhandler(500)
def server_error(e):
    db.session.rollback()
    return render_template('500.html', current_lang=get_locale()), 500


@app.errorhandler(403)
def forbidden(e):
    return render_template('403.html', current_lang=get_locale()), 403


# ─────────────────────────────────────────
#  PUBLIC ROUTES
# ─────────────────────────────────────────

@app.route('/')
def home():
    try:
        return render_template('home.html', current_lang=get_locale())
    except Exception as e:
        return render_template('error.html', error="Unable to load home page"), 500


@app.route('/health')
def health_check():
    return jsonify({
        'status': 'healthy',
        'timestamp': datetime.utcnow().isoformat(),
        'database': 'connected'
    })


# ─────────────────────────────────────────
#  REGISTRATION
# ─────────────────────────────────────────

@app.route('/register', methods=['GET', 'POST'])
def register():
    if 'user_id' in session:
        return redirect(url_for('student_dashboard' if session.get('role') == 'student' else 'teacher_dashboard'))

    if request.method == 'POST':
        try:
            name = sanitize_input(request.form.get('name', '').strip())
            email = sanitize_input(request.form.get('email', '').strip().lower())
            password = request.form.get('password', '')
            role = request.form.get('role', 'student')
            grade = request.form.get('grade', None)
            parent_email = sanitize_input(request.form.get('parent_email', '').strip().lower())

            if not name or not email or not password:
                flash('All fields are required.', 'error')
                return render_template('register.html', current_lang=get_locale())

            if len(name) < 2 or len(name) > 100:
                flash('Name must be between 2 and 100 characters.', 'error')
                return render_template('register.html', current_lang=get_locale())

            if not validate_email(email):
                flash('Please enter a valid email address.', 'error')
                return render_template('register.html', current_lang=get_locale())

            if parent_email and not validate_email(parent_email):
                flash('Please enter a valid parent email address.', 'error')
                return render_template('register.html', current_lang=get_locale())

            if len(password) < 6:
                flash('Password must be at least 6 characters.', 'error')
                return render_template('register.html', current_lang=get_locale())

            if role == 'teacher':
                grade = None
            else:
                try:
                    grade = int(grade)
                    if grade < 6 or grade > 12:
                        raise ValueError
                except (ValueError, TypeError):
                    flash('Please select a valid grade (6–12).', 'error')
                    return render_template('register.html', current_lang=get_locale())

            if User.query.filter_by(email=email).first():
                flash('An account with this email already exists.', 'error')
                return render_template('register.html', current_lang=get_locale())

            hashed_pw = bcrypt.generate_password_hash(password).decode('utf-8')
            user = User(
                name=name,
                email=email,
                password=hashed_pw,
                role=role,
                grade=grade,
                preferred_language='en',
                parent_email=parent_email if parent_email else None
            )
            
            db.session.add(user)
            db.session.commit()

            flash(f'✨ Account created successfully! Welcome to ShikshaSetu, {name}!', 'success')
            return redirect(url_for('login'))

        except Exception as e:
            db.session.rollback()
            print(f"Registration error: {e}")
            flash('An error occurred during registration. Please try again.', 'error')
            return render_template('register.html', current_lang=get_locale())

    return render_template('register.html', current_lang=get_locale())


@app.route('/send-progress-email/<int:student_id>', methods=['POST'])
@teacher_required
def send_progress_email(student_id):
    try:
        teacher = get_current_user()
        student = User.query.get(student_id)
        
        if not student:
            return jsonify({'success': False, 'message': 'Student not found'}), 404
        
        if student.role != 'student':
            return jsonify({'success': False, 'message': 'User is not a student'}), 400
        
        success, message = send_student_progress_email(student, teacher.name)
        
        if success:
            return jsonify({'success': True, 'message': message})
        else:
            return jsonify({'success': False, 'message': message}), 400
            
    except Exception as e:
        print(f"Send progress email error: {e}")
        return jsonify({'success': False, 'message': f'Error: {str(e)}'}), 500


# ─────────────────────────────────────────
#  LOGIN / LOGOUT
# ─────────────────────────────────────────

@app.route('/login', methods=['GET', 'POST'])
def login():
    if 'user_id' in session:
        return redirect(url_for('student_dashboard' if session.get('role') == 'student' else 'teacher_dashboard'))

    if request.method == 'POST':
        try:
            email = sanitize_input(request.form.get('email', '').strip().lower())
            password = request.form.get('password', '')
            remember = request.form.get('remember') == 'on'

            if not email or not password:
                flash('Please enter both email and password.', 'error')
                return render_template('login.html', current_lang=get_locale())

            user = User.query.filter_by(email=email).first()

            if user and user.is_active and bcrypt.check_password_hash(user.password, password):
                session.permanent = remember
                session['user_id'] = user.id
                session['role'] = user.role
                session['name'] = user.name
                session['language'] = user.preferred_language or 'en'

                user.last_login = datetime.utcnow()
                db.session.commit()

                flash(f'👑 Welcome back, {user.name}! Ready for your next quest?', 'success')

                if user.role == 'student':
                    return redirect(url_for('student_dashboard'))
                else:
                    return redirect(url_for('teacher_dashboard'))
            else:
                flash('Invalid email or password. Please try again.', 'error')
                return render_template('login.html', current_lang=get_locale())

        except Exception as e:
            print(f"Login error: {e}")
            flash('An error occurred during login. Please try again.', 'error')
            return render_template('login.html', current_lang=get_locale())

    return render_template('login.html', current_lang=get_locale())


@app.route('/logout')
def logout():
    user_name = session.get('name', 'User')
    session.clear()
    flash(f'👋 Goodbye, {user_name}! See you soon!', 'info')
    return redirect(url_for('home'))


# ─────────────────────────────────────────
#  PASSWORD RESET
# ─────────────────────────────────────────

@app.route('/forgot-password', methods=['GET', 'POST'])
def forgot_password():
    if request.method == 'POST':
        try:
            email = sanitize_input(request.form.get('email', '').strip().lower())

            if not email or not validate_email(email):
                flash('Please enter a valid email address.', 'error')
                return render_template('forgot_password.html', current_lang=get_locale())

            user = User.query.filter_by(email=email).first()

            if user:
                token = generate_reset_token()
                user.reset_token = token
                user.reset_token_expiry = datetime.utcnow() + timedelta(seconds=app.config['PASSWORD_RESET_TIMEOUT'])
                db.session.commit()

                if app.debug:
                    flash(f'🔑 Reset token: {token}', 'info')
                else:
                    flash(f'📧 Password reset instructions sent to {email}', 'success')
            else:
                time.sleep(1)
                flash('If an account exists with this email, you will receive reset instructions.', 'info')

            return redirect(url_for('login'))

        except Exception as e:
            print(f"Forgot password error: {e}")
            flash('An error occurred. Please try again.', 'error')
            return render_template('forgot_password.html', current_lang=get_locale())

    return render_template('forgot_password.html', current_lang=get_locale())


@app.route('/reset-password/<token>', methods=['GET', 'POST'])
def reset_password(token):
    if request.method == 'POST':
        try:
            password = request.form.get('password', '')
            confirm = request.form.get('confirm_password', '')

            if len(password) < 6:
                flash('Password must be at least 6 characters.', 'error')
                return render_template('reset_password.html', token=token, current_lang=get_locale())

            if password != confirm:
                flash('Passwords do not match.', 'error')
                return render_template('reset_password.html', token=token, current_lang=get_locale())

            user = User.query.filter_by(reset_token=token).first()

            if not user or (user.reset_token_expiry and user.reset_token_expiry < datetime.utcnow()):
                flash('Invalid or expired reset token.', 'error')
                return redirect(url_for('forgot_password'))

            user.password = bcrypt.generate_password_hash(password).decode('utf-8')
            user.reset_token = None
            user.reset_token_expiry = None
            db.session.commit()

            flash('✅ Password updated successfully! Please log in.', 'success')
            return redirect(url_for('login'))

        except Exception as e:
            print(f"Reset password error: {e}")
            flash('An error occurred. Please try again.', 'error')
            return render_template('reset_password.html', token=token, current_lang=get_locale())

    return render_template('reset_password.html', token=token, current_lang=get_locale())


# ─────────────────────────────────────────
#  GOOGLE AUTH (Placeholder)
# ─────────────────────────────────────────

@app.route('/auth/google')
def google_auth():
    flash('🔧 Google login is coming soon! Please use email/password for now.', 'info')
    return redirect(url_for('login'))


@app.route('/auth/google/callback')
def google_auth_callback():
    flash('Google login successful!', 'success')
    return redirect(url_for('student_dashboard'))


# ─────────────────────────────────────────
#  TRANSLATION ROUTES
# ─────────────────────────────────────────

@app.route('/set-language/<lang>')
def set_language(lang):
    try:
        if lang in app.config['LANGUAGE_CODES']:
            session['language'] = lang
            user = get_current_user()
            if user:
                user.preferred_language = lang
                db.session.commit()
            return jsonify({'status': 'success', 'language': lang})
        return jsonify({'status': 'error', 'message': 'Invalid language'}), 400
    except Exception as e:
        print(f"Set language error: {e}")
        return jsonify({'status': 'error', 'message': str(e)}), 500


@app.route('/get-language')
def get_language():
    try:
        return jsonify({'language': get_locale()})
    except Exception as e:
        return jsonify({'language': 'en'})


@app.route('/translate', methods=['POST'])
def translate():
    try:
        data = request.get_json()
        if not data:
            return jsonify({'error': 'No data provided'}), 400
            
        texts = data.get('texts', [])
        target_lang = data.get('lang', 'en')
        page_url = data.get('page_url', request.referrer or '/')
        
        if not isinstance(texts, list):
            return jsonify({'error': 'Texts must be a list'}), 400
        
        if target_lang == 'en':
            return jsonify({'translations': texts})
        
        if target_lang not in app.config['LANGUAGE_CODES']:
            return jsonify({'error': 'Unsupported language'}), 400
        
        translated_texts = pre_translator.translate_batch(
            texts, 
            app.config['LANGUAGE_CODES'][target_lang], 
            page_url
        )
        
        return jsonify({'translations': translated_texts})
    
    except Exception as e:
        print(f"Translation endpoint error: {e}")
        return jsonify({'translations': texts if 'texts' in locals() else [], 'error': str(e)}), 500


@app.route('/save-original-texts', methods=['POST'])
def save_original_texts():
    try:
        data = request.get_json()
        if not data:
            return jsonify({'status': 'error', 'error': 'No data provided'}), 400
            
        page_url = data.get('page_url')
        texts = data.get('texts', [])
        
        if not page_url:
            return jsonify({'status': 'error', 'error': 'Page URL required'}), 400
        
        pre_translator.text_manager.save_original_texts(page_url, texts)
        return jsonify({'status': 'success'})
        
    except Exception as e:
        print(f"Save original texts error: {e}")
        return jsonify({'status': 'error', 'error': str(e)}), 500


@app.route('/api/flash-messages')
def get_flash_messages():
    messages = []
    for category, message in get_flashed_messages(with_categories=True):
        messages.append({
            'category': category if category in ['success', 'error', 'warning', 'info'] else 'info',
            'message': message
        })
    return jsonify({'messages': messages})


@app.route('/api/game-translations', methods=['POST'])
def game_translations():
    try:
        data = request.get_json()
        if not data:
            return jsonify({'error': 'No data provided'}), 400
            
        texts = data.get('texts', [])
        target_lang = data.get('lang', 'en')
        page_url = data.get('page_url', '/game')
        
        if not isinstance(texts, list):
            return jsonify({'error': 'Texts must be a list'}), 400
        
        if target_lang == 'en':
            return jsonify({'translations': texts})
        
        if target_lang not in app.config['LANGUAGE_CODES']:
            return jsonify({'error': 'Unsupported language'}), 400
        
        translated = pre_translator.translate_batch(
            texts, 
            app.config['LANGUAGE_CODES'][target_lang], 
            page_url
        )
        
        return jsonify({'translations': translated})
        
    except Exception as e:
        print(f"Game translations error: {e}")
        return jsonify({'error': str(e)}), 500


# ─────────────────────────────────────────
#  STUDENT DASHBOARD
# ─────────────────────────────────────────

@app.route('/student')
@student_required
def student_dashboard():
    try:
        user = get_current_user()
        if not user:
            return redirect(url_for('login'))

        recent = GameSession.query.filter_by(user_id=user.id).order_by(GameSession.played_at.desc()).limit(5).all()

        xp_for_next = user.level * 500
        xp_this_lvl = user.xp - (user.level - 1) * 500
        xp_pct = min(100, int((xp_this_lvl / 500) * 100)) if xp_this_lvl > 0 else 0

        all_students = User.query.filter_by(role='student').order_by(User.xp.desc()).all()
        rank = next((i + 1 for i, u in enumerate(all_students) if u.id == user.id), '—')

        return render_template(
            'student_dashboard.html',
            user=user,
            recent=recent,
            xp_pct=xp_pct,
            xp_for_next=xp_for_next,
            rank=rank,
            total_students=len(all_students),
            current_lang=get_locale()
        )
    except Exception as e:
        print(f"Student dashboard error: {e}")
        flash('Error loading dashboard. Please try again.', 'error')
        return redirect(url_for('home'))


# ─────────────────────────────────────────
#  TEACHER DASHBOARD
# ─────────────────────────────────────────

@app.route('/teacher')
@teacher_required
def teacher_dashboard():
    try:
        user = get_current_user()
        if not user:
            return redirect(url_for('login'))

        students = User.query.filter_by(role='student').order_by(User.xp.desc()).all()

        total_students = len(students)
        total_xp = sum(s.xp or 0 for s in students)
        avg_xp = total_xp // total_students if total_students else 0
        highest_level = max((s.level or 1 for s in students), default=0)
        active_count = sum(1 for s in students if (s.xp or 0) > 50)

        today = datetime.utcnow().date()
        games_today = GameSession.query.filter(
            db.func.date(GameSession.played_at) == today
        ).count()
        
        students_with_email = sum(1 for s in students if s.parent_email and s.parent_email.strip())
        reports_sent_today = 0

        students_json_data = []
        emojis = ['🦁', '🐯', '🦊', '🐺', '🦅', '🐉', '🦋', '🌟', '⚡', '🔥', '💎', '🚀', '🎯', '🌈', '🏆']
        
        for idx, s in enumerate(students):
            students_json_data.append({
                'id': s.id,
                'name': s.name,
                'xp': s.xp or 0,
                'level': s.level or 1,
                'grade': s.grade,
                'parent_email': s.parent_email,
                'avatar_emoji': emojis[idx % len(emojis)]
            })
        
        students_json = json.dumps(students_json_data)

        return render_template(
            'teacher_dashboard.html',
            user=user,
            students=students,
            students_json=students_json,
            total_students=total_students,
            total_xp=total_xp,
            avg_xp=avg_xp,
            highest_level=highest_level,
            active_count=active_count,
            games_today=games_today,
            students_with_email=students_with_email,
            reports_sent_today=reports_sent_today,
            current_lang=get_locale()
        )
    except Exception as e:
        print(f"Teacher dashboard error: {e}")
        flash('Error loading dashboard. Please try again.', 'error')
        return redirect(url_for('home'))


# ─────────────────────────────────────────
#  SUBJECTS
# ─────────────────────────────────────────

@app.route('/subjects')
@student_required
def subjects():
    try:
        user = get_current_user()
        if not user:
            return redirect(url_for('login'))

        subject_list = get_subjects_for_grade(user.grade)

        return render_template(
            'subjects.html',
            user=user,
            subjects=subject_list,
            current_lang=get_locale()
        )
    except Exception as e:
        print(f"Subjects error: {e}")
        flash('Error loading subjects. Please try again.', 'error')
        return redirect(url_for('student_dashboard'))


# ─────────────────────────────────────────
#  GAME
# ─────────────────────────────────────────

@app.route('/game/<subject>', methods=['GET', 'POST'])
@student_required
def game(subject):
    try:
        user = get_current_user()
        if not user:
            return redirect(url_for('login'))

        subject_lower = subject.lower()
        if subject_lower not in VALID_SUBJECTS:
            flash('Invalid subject selected.', 'error')
            return redirect(url_for('subjects'))

        subject_display = subject.capitalize()
        if subject_lower in ('math', 'maths', 'mathematics'):
            subject_display = 'Mathematics'
        elif subject_lower in ('python', 'coding', 'computer science'):
            subject_display = 'Python'
        elif subject_lower == 'java':
            subject_display = 'Java'
        elif subject_lower in ('html', 'html/css'):
            subject_display = 'HTML'

        if request.method == 'POST':
            try:
                score = max(0, min(int(request.form.get('score', 0)), 9999))
                accuracy = float(request.form.get('accuracy', 0))
                duration = int(request.form.get('duration', 0))
            except (ValueError, TypeError) as e:
                print(f"Error parsing game data: {e}")
                score = 0
                accuracy = 0
                duration = 0

            old_level = user.level
            user.xp += score
            update_level(user)

            game_log = GameSession(
                user_id=user.id,
                subject=subject_display,
                grade=user.grade,
                score=score,
                xp_earned=score,
                accuracy=accuracy,
                duration=duration
            )
            db.session.add(game_log)
            db.session.commit()
            
            print(f"✅ Game saved: Subject={subject_display}, Score={score}")

            flash(f'🎮 Mission complete! +{score} XP earned!', 'success')

            if request.headers.get('X-Requested-With') == 'XMLHttpRequest':
                return jsonify({
                    'status': 'success',
                    'xp_earned': score,
                    'total_xp': user.xp,
                    'level': user.level,
                    'message': f'+{score} XP earned!'
                })

            return redirect(url_for('student_dashboard'))

        return render_template(
            'game.html',
            subject=subject_display,
            grade=user.grade or 6,
            user=user,
            current_lang=get_locale()
        )
    except Exception as e:
        print(f"Game error: {e}")
        flash('Error loading game. Please try again.', 'error')
        return redirect(url_for('subjects'))


# ─────────────────────────────────────────
#  LEADERBOARD
# ─────────────────────────────────────────

@app.route('/leaderboard')
@login_required
def leaderboard():
    try:
        current_user = get_current_user()
        if not current_user:
            return redirect(url_for('login'))

        users = User.query.filter_by(role='student').order_by(User.xp.desc()).limit(50).all()

        return render_template(
            'leaderboard.html',
            users=users,
            current_user=current_user,
            current_lang=get_locale()
        )
    except Exception as e:
        print(f"Leaderboard error: {e}")
        flash('Error loading leaderboard.', 'error')
        return redirect(url_for('home'))


@app.route('/api/leaderboard/filter')
@login_required
def api_leaderboard_filter():
    try:
        filter_type = request.args.get('type', 'global')
        current_user = get_current_user()
        
        query = User.query.filter_by(role='student')
        
        if filter_type.startswith('grade_'):
            grade_num = int(filter_type.split('_')[1])
            query = query.filter_by(grade=grade_num)
        elif filter_type == 'global':
            pass
        elif filter_type == 'my_school':
            pass
        elif filter_type == 'physics':
            physics_students = db.session.query(GameSession.user_id).filter(
                GameSession.subject.ilike('%Physics%')
            ).distinct().subquery()
            query = query.filter(User.id.in_(physics_students))
        elif filter_type == 'chemistry':
            chemistry_students = db.session.query(GameSession.user_id).filter(
                GameSession.subject.ilike('%Chemistry%')
            ).distinct().subquery()
            query = query.filter(User.id.in_(chemistry_students))
        elif filter_type == 'biology':
            biology_students = db.session.query(GameSession.user_id).filter(
                GameSession.subject.ilike('%Biology%')
            ).distinct().subquery()
            query = query.filter(User.id.in_(biology_students))
        elif filter_type == 'mathematics':
            math_students = db.session.query(GameSession.user_id).filter(
                GameSession.subject.ilike('%Mathematics%') | GameSession.subject.ilike('%Math%')
            ).distinct().subquery()
            query = query.filter(User.id.in_(math_students))
        elif filter_type == 'python':
            python_students = db.session.query(GameSession.user_id).filter(
                GameSession.subject.ilike('%Python%')
            ).distinct().subquery()
            query = query.filter(User.id.in_(python_students))
        
        users = query.order_by(User.xp.desc()).limit(50).all()
        
        users_data = []
        emojis = ['🦁', '🐯', '🦊', '🐺', '🦅', '🐉', '🦋', '🌟', '⚡', '🔥', '💎', '🚀', '🎯', '🌈', '🏆']
        
        for i, user in enumerate(users):
            users_data.append({
                'id': user.id,
                'name': user.name,
                'xp': user.xp or 0,
                'level': user.level or 1,
                'grade': user.grade,
                'rank': i + 1,
                'avatar_emoji': emojis[i % len(emojis)]
            })
        
        total_xp = sum(u.xp or 0 for u in users)
        avg_xp = total_xp // len(users) if users else 0
        
        user_rank = None
        user_xp = None
        if current_user and current_user.role == 'student':
            all_students = query.order_by(User.xp.desc()).all()
            for i, u in enumerate(all_students):
                if u.id == current_user.id:
                    user_rank = i + 1
                    user_xp = u.xp
                    break
        
        return jsonify({
            'success': True,
            'users': users_data,
            'stats': {
                'total': len(users),
                'total_xp': total_xp,
                'avg_xp': avg_xp
            },
            'current_user_rank': user_rank,
            'current_user_xp': user_xp
        })
        
    except Exception as e:
        print(f"Leaderboard filter error: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500


# ─────────────────────────────────────────
#  PROFILE
# ─────────────────────────────────────────

@app.route('/profile')
@login_required
def profile():
    try:
        user = get_current_user()
        if not user:
            return redirect(url_for('login'))

        all_sessions = GameSession.query.filter_by(user_id=user.id).order_by(GameSession.played_at.desc()).all()
        total_games = len(all_sessions)
        total_xp_earned = sum(s.xp_earned or 0 for s in all_sessions)

        all_students = User.query.filter_by(role='student').order_by(User.xp.desc()).all()
        rank = next((i + 1 for i, u in enumerate(all_students) if u.id == user.id), '—')

        return render_template(
            'profile.html',
            user=user,
            all_sessions=all_sessions,
            total_games=total_games,
            total_xp_earned=total_xp_earned,
            rank=rank,
            current_lang=get_locale()
        )
    except Exception as e:
        print(f"Profile error: {e}")
        flash('Error loading profile.', 'error')
        return redirect(url_for('home'))


@app.route('/profile/update', methods=['POST'])
@login_required
def update_profile():
    try:
        user = get_current_user()
        if not user:
            return jsonify({'error': 'Not logged in'}), 401

        data = request.get_json()
        if not data:
            return jsonify({'error': 'No data provided'}), 400

        if 'name' in data:
            new_name = sanitize_input(data['name'].strip())
            if 2 <= len(new_name) <= 100:
                user.name = new_name
            else:
                return jsonify({'error': 'Name must be 2-100 characters'}), 400

        if user.role == 'student' and 'grade' in data:
            try:
                new_grade = int(data['grade'])
                if 6 <= new_grade <= 12:
                    user.grade = new_grade
                else:
                    return jsonify({'error': 'Grade must be 6-12'}), 400
            except (ValueError, TypeError):
                return jsonify({'error': 'Invalid grade'}), 400

        if 'language' in data:
            lang = data['language']
            if lang in app.config['LANGUAGE_CODES']:
                user.preferred_language = lang
                session['language'] = lang

        if 'parent_email' in data and user.role == 'student':
            parent_email = sanitize_input(data['parent_email'].strip().lower())
            if parent_email and not validate_email(parent_email):
                return jsonify({'error': 'Invalid parent email'}), 400
            user.parent_email = parent_email if parent_email else None

        db.session.commit()
        
        return jsonify({
            'status': 'success',
            'message': 'Profile updated successfully',
            'user': user.to_dict()
        })

    except Exception as e:
        print(f"Profile update error: {e}")
        return jsonify({'error': 'Failed to update profile'}), 500


# ─────────────────────────────────────────
#  API ENDPOINTS
# ─────────────────────────────────────────

@app.route('/api/xp', methods=['POST'])
@login_required
def api_update_xp():
    try:
        user = get_current_user()
        if not user:
            return jsonify({'error': 'Not logged in'}), 401

        data = request.get_json(silent=True) or {}

        try:
            score = max(0, min(int(data.get('score', 0)), 9999))
        except (ValueError, TypeError):
            score = 0

        subject_name = str(data.get('subject', 'Unknown'))[:50]
        accuracy = float(data.get('accuracy', 0))
        duration = int(data.get('duration', 0))

        old_level = user.level
        user.xp += score
        update_level(user)

        log = GameSession(
            user_id=user.id,
            subject=subject_name,
            grade=user.grade,
            score=score,
            xp_earned=score,
            accuracy=accuracy,
            duration=duration
        )
        db.session.add(log)
        db.session.commit()
        
        print(f"✅ API Game saved: Subject={subject_name}, Score={score}")

        return jsonify({
            'status': 'ok',
            'xp_earned': score,
            'total_xp': user.xp,
            'level': user.level,
            'level_up': user.level > old_level,
            'message': f'+{score} XP earned!'
        })

    except Exception as e:
        print(f"API XP update error: {e}")
        return jsonify({'error': 'Failed to update XP'}), 500


@app.route('/api/user/stats')
@login_required
def api_user_stats():
    try:
        user = get_current_user()
        if not user:
            return jsonify({'error': 'Not logged in'}), 401

        sessions = GameSession.query.filter_by(user_id=user.id).all()
        
        total_games = len(sessions)
        total_xp = sum(s.xp_earned or 0 for s in sessions)
        avg_score = total_xp // total_games if total_games > 0 else 0
        best_score = max((s.score or 0 for s in sessions), default=0)
        
        subject_breakdown = {}
        for s in sessions:
            if s.subject not in subject_breakdown:
                subject_breakdown[s.subject] = {
                    'games': 0,
                    'total_xp': 0,
                    'best': 0
                }
            subject_breakdown[s.subject]['games'] += 1
            subject_breakdown[s.subject]['total_xp'] += s.xp_earned or 0
            subject_breakdown[s.subject]['best'] = max(subject_breakdown[s.subject]['best'], s.score or 0)

        all_students = User.query.filter_by(role='student').order_by(User.xp.desc()).all()
        rank = next((i + 1 for i, u in enumerate(all_students) if u.id == user.id), None)

        return jsonify({
            'user': user.to_dict(),
            'stats': {
                'total_games': total_games,
                'total_xp': total_xp,
                'avg_score': avg_score,
                'best_score': best_score,
                'rank': rank,
                'total_students': len(all_students),
                'subject_breakdown': subject_breakdown
            }
        })

    except Exception as e:
        print(f"API user stats error: {e}")
        return jsonify({'error': 'Failed to get stats'}), 500


# ─────────────────────────────────────────
#  STATIC FILES CREATION
# ─────────────────────────────────────────

def create_static_files():
    notifications_js = '''class NotificationSystem {
    constructor() {
        this.container = document.getElementById('notificationWrapper');
        this.notifications = [];
        this.maxNotifications = 5;
    }

    show(message, type = 'info', duration = 5000) {
        const icons = {
            success: '🎉',
            error: '❌',
            warning: '⚠️',
            info: 'ℹ️'
        };

        const icon = icons[type] || '📢';
        const id = 'notif_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);

        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.id = id;
        notification.innerHTML = `
            <div class="notification-content">
                <span class="notification-icon">${icon}</span>
                <div class="notification-message">${this.escapeHtml(message)}</div>
                <button class="notification-close" onclick="notificationSystem.close('${id}')">✕</button>
            </div>
            <div class="notification-progress" style="animation-duration: ${duration}ms"></div>
        `;

        this.container.appendChild(notification);
        this.notifications.push({ id, element: notification, timeout: null });

        if (this.notifications.length > this.maxNotifications) {
            const oldest = this.notifications.shift();
            this._removeNotification(oldest.id);
        }

        setTimeout(() => notification.classList.add('show'), 10);

        const timeout = setTimeout(() => {
            this.close(id);
        }, duration);

        const notifIndex = this.notifications.findIndex(n => n.id === id);
        if (notifIndex !== -1) {
            this.notifications[notifIndex].timeout = timeout;
        }

        return id;
    }

    success(message, duration = 5000) {
        return this.show(message, 'success', duration);
    }

    error(message, duration = 5000) {
        return this.show(message, 'error', duration);
    }

    warning(message, duration = 5000) {
        return this.show(message, 'warning', duration);
    }

    info(message, duration = 5000) {
        return this.show(message, 'info', duration);
    }

    close(id) {
        this._removeNotification(id);
    }

    _removeNotification(id) {
        const index = this.notifications.findIndex(n => n.id === id);
        if (index === -1) return;

        const notification = this.notifications[index];
        const element = notification.element;

        if (notification.timeout) {
            clearTimeout(notification.timeout);
        }

        element.classList.add('hiding');
        element.classList.remove('show');

        setTimeout(() => {
            if (element.parentNode) {
                element.parentNode.removeChild(element);
            }
        }, 300);

        this.notifications.splice(index, 1);
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    clearAll() {
        while (this.notifications.length > 0) {
            this.close(this.notifications[0].id);
        }
    }

    async fetchFlashMessages() {
        try {
            const response = await fetch('/api/flash-messages');
            const data = await response.json();

            if (data.messages && data.messages.length > 0) {
                data.messages.forEach(msg => {
                    this.show(msg.message, msg.category);
                });
            }
        } catch (error) {
            console.error('Failed to fetch flash messages:', error);
        }
    }
}

const notificationSystem = new NotificationSystem();
window.notificationSystem = notificationSystem;

document.addEventListener('DOMContentLoaded', function() {
    const flashMessages = document.querySelectorAll('.flash-message');
    flashMessages.forEach(msg => {
        const type = msg.dataset.type || 'info';
        const text = msg.textContent;
        notificationSystem.show(text, type);
        msg.remove();
    });

    setTimeout(() => {
        notificationSystem.fetchFlashMessages();
    }, 100);
});'''

    translation_js = '''class TranslationManager {
    constructor() {
        this.currentLang = window.CURRENT_LANG || 'en';
        this.originalTexts = new Map();
        this.pageUrl = window.location.pathname;
        this.isTranslating = false;
        this.init();
    }

    async init() {
        try {
            const response = await fetch('/get-language');
            const data = await response.json();
            this.currentLang = data.language;

            const select = document.getElementById('language-select');
            if (select) {
                select.value = this.currentLang;
            }

            await this.saveOriginalTexts();

            if (this.currentLang !== 'en') {
                await this.translatePage(this.currentLang);
            }
        } catch (error) {
            console.error('Failed to initialize translation:', error);
        }
    }

    async saveOriginalTexts() {
        const elements = this.getTranslatableElements();
        const texts = elements.map(el => el.textContent.trim());

        this.originalTexts.set(this.pageUrl, texts);

        try {
            await fetch('/save-original-texts', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    page_url: this.pageUrl,
                    texts: texts
                })
            });
        } catch (error) {
            console.error('Failed to save original texts:', error);
        }
    }

    async changeLanguage(lang) {
        if (lang === this.currentLang || this.isTranslating) return;

        this.isTranslating = true;
        this.showLoading();
        this.currentLang = lang;

        try {
            await fetch(`/set-language/${lang}`);

            await this.translatePage(lang);

            const languageNames = {
                'en': 'English',
                'kn': 'Kannada',
                'hi': 'Hindi',
                'ml': 'Malayalam'
            };
            notificationSystem.success(`Language changed to ${languageNames[lang]}!`);

        } catch (error) {
            console.error('Language change failed:', error);
            this.hideLoading();
            this.isTranslating = false;

            const select = document.getElementById('language-select');
            if (select) {
                select.value = this.currentLang;
            }
            notificationSystem.error('Failed to change language');
        }
    }

    async translatePage(lang) {
        const elements = this.getTranslatableElements();

        if (lang === 'en') {
            this.restoreEnglishTexts(elements);
            this.hideLoading();
            this.isTranslating = false;
        } else {
            await this.translateToOtherLanguage(elements, lang);
        }
    }

    restoreEnglishTexts(elements) {
        const originalTexts = this.originalTexts.get(this.pageUrl);
        if (originalTexts && originalTexts.length === elements.length) {
            elements.forEach((element, index) => {
                if (originalTexts[index] && element.textContent !== originalTexts[index]) {
                    element.textContent = originalTexts[index];
                }
            });
        }
    }

    async translateToOtherLanguage(elements, lang) {
        const texts = elements.map(el => el.textContent.trim());

        try {
            this.updateLoadingText(lang);

            const response = await fetch('/translate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    texts: texts,
                    lang: lang,
                    page_url: this.pageUrl
                })
            });

            const data = await response.json();

            if (data.translations) {
                this.updateElements(elements, data.translations);
            }
        } catch (error) {
            console.error('Translation failed:', error);
            notificationSystem.error('Translation failed. Please try again.');
        } finally {
            this.hideLoading();
            this.isTranslating = false;
        }
    }

    updateLoadingText(lang) {
        const languageNames = {
            'en': 'English',
            'kn': 'Kannada',
            'hi': 'Hindi',
            'ml': 'Malayalam'
        };

        const loadingText = document.querySelector('.spinner-text');
        if (loadingText) {
            loadingText.textContent = `Translating to ${languageNames[lang]}...`;
        }
    }

    getTranslatableElements() {
        return Array.from(document.querySelectorAll('[data-translate]'));
    }

    updateElements(elements, translations) {
        elements.forEach((element, index) => {
            if (translations[index] && translations[index] !== element.textContent) {
                element.textContent = translations[index];
            }
        });
    }

    showLoading() {
        const overlay = document.getElementById('loadingOverlay');
        const spinner = document.getElementById('loadingSpinner');
        if (overlay) overlay.style.display = 'block';
        if (spinner) spinner.style.display = 'block';

        const select = document.getElementById('language-select');
        if (select) select.disabled = true;

        document.body.style.pointerEvents = 'none';
        document.body.style.userSelect = 'none';
    }

    hideLoading() {
        const overlay = document.getElementById('loadingOverlay');
        const spinner = document.getElementById('loadingSpinner');
        if (overlay) overlay.style.display = 'none';
        if (spinner) spinner.style.display = 'none';

        const select = document.getElementById('language-select');
        if (select) select.disabled = false;

        document.body.style.pointerEvents = 'auto';
        document.body.style.userSelect = 'auto';

        const loadingText = document.querySelector('.spinner-text');
        if (loadingText && loadingText.dataset.translate) {
            loadingText.textContent = 'Translating content...';
        }
    }

    async translateGameTexts(texts, lang) {
        try {
            const response = await fetch('/api/game-translations', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    texts: texts,
                    lang: lang,
                    page_url: '/game'
                })
            });
            const data = await response.json();
            return data.translations || texts;
        } catch (error) {
            console.error('Game translation failed:', error);
            return texts;
        }
    }
}

let translationManager;

document.addEventListener('DOMContentLoaded', function() {
    translationManager = new TranslationManager();

    let lastLanguageChange = 0;
    const languageSelect = document.getElementById('language-select');

    if (languageSelect) {
        languageSelect.addEventListener('change', function() {
            const now = Date.now();
            if (now - lastLanguageChange < 2000) {
                this.value = translationManager.currentLang;
                return;
            }
            lastLanguageChange = now;

            translationManager.changeLanguage(this.value);
        });
    }
});

window.translationManager = translationManager;'''

    try:
        with open('static/js/notifications.js', 'w', encoding='utf-8') as f:
            f.write(notifications_js.strip())
        print("✅ Created notifications.js")
    except Exception as e:
        print(f"❌ Error creating notifications.js: {e}")

    try:
        with open('static/js/translation.js', 'w', encoding='utf-8') as f:
            f.write(translation_js.strip())
        print("✅ Created translation.js")
    except Exception as e:
        print(f"❌ Error creating translation.js: {e}")


# ─────────────────────────────────────────
#  DATABASE MIGRATION
# ─────────────────────────────────────────

def migrate_database():
    try:
        conn = sqlite3.connect('shikshasetu.db', timeout=10)
        cursor = conn.cursor()

        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='user'")
        if not cursor.fetchone():
            print("📦 Creating new database...")
            conn.close()
            return

        cursor.execute("PRAGMA table_info(user)")
        columns = [col[1] for col in cursor.fetchall()]

        if 'parent_email' not in columns:
            try:
                cursor.execute("ALTER TABLE user ADD COLUMN parent_email VARCHAR(120)")
                print("✅ Added column: parent_email")
            except Exception as e:
                print(f"⚠️ Could not add parent_email: {e}")

        if 'reset_token_expiry' not in columns:
            try:
                cursor.execute("ALTER TABLE user ADD COLUMN reset_token_expiry TIMESTAMP")
                print("✅ Added column: reset_token_expiry")
            except Exception as e:
                print(f"⚠️ Could not add reset_token_expiry: {e}")

        migrations = [
            ('preferred_language', "VARCHAR(10) DEFAULT 'en'"),
            ('created_at', "TIMESTAMP"),
            ('last_login', "TIMESTAMP"),
            ('is_active', "BOOLEAN DEFAULT 1"),
            ('reset_token', "VARCHAR(100)")
        ]

        for col_name, col_type in migrations:
            if col_name not in columns:
                try:
                    cursor.execute(f"ALTER TABLE user ADD COLUMN {col_name} {col_type}")
                    print(f"✅ Added column: {col_name}")
                except Exception as e:
                    print(f"⚠️ Could not add {col_name}: {e}")

        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='game_session'")
        if cursor.fetchone():
            cursor.execute("PRAGMA table_info(game_session)")
            gs_columns = [col[1] for col in cursor.fetchall()]

            gs_migrations = [
                ('duration', "INTEGER DEFAULT 0"),
                ('accuracy', "FLOAT DEFAULT 0.0")
            ]

            for col_name, col_type in gs_migrations:
                if col_name not in gs_columns:
                    try:
                        cursor.execute(f"ALTER TABLE game_session ADD COLUMN {col_name} {col_type}")
                        print(f"✅ Added GameSession column: {col_name}")
                    except Exception as e:
                        print(f"⚠️ Could not add {col_name}: {e}")

        conn.commit()
        conn.close()
        print("✅ Database migration completed")

    except Exception as e:
        print(f"⚠️ Migration warning: {e}")


def create_demo_data():
    try:
        if User.query.count() == 0:
            print("📝 Creating demo data...")

            teacher = User(
                name="Demo Teacher",
                email="teacher@demo.com",
                password=bcrypt.generate_password_hash("teacher123").decode('utf-8'),
                role="teacher",
                xp=0,
                level=1,
                preferred_language='en',
                created_at=datetime.utcnow(),
                last_login=None,
                is_active=True
            )
            db.session.add(teacher)

            demo_students = [
                ("Alex Student", "alex@demo.com", 6, 1250, 3, "parent@example.com"),
                ("Priya Kumar", "priya@demo.com", 8, 2450, 5, "priya.parent@example.com"),
                ("Rahul Singh", "rahul@demo.com", 10, 980, 2, "rahul.parent@example.com"),
                ("Neha Patel", "neha@demo.com", 7, 1870, 4, "neha.parent@example.com"),
                ("Sofia Martinez", "sofia@demo.com", 9, 3200, 7, "sofia.parent@example.com"),
                ("James Wilson", "james@demo.com", 11, 890, 2, "james.parent@example.com"),
            ]

            for name, email, grade, xp, level, parent_email in demo_students:
                student = User(
                    name=name,
                    email=email,
                    password=bcrypt.generate_password_hash("student123").decode('utf-8'),
                    role="student",
                    grade=grade,
                    xp=xp,
                    level=level,
                    preferred_language='en',
                    parent_email=parent_email,
                    created_at=datetime.utcnow(),
                    last_login=None,
                    is_active=True
                )
                db.session.add(student)

            db.session.commit()
            print("✅ Demo data created")
        else:
            print("📊 Database already has users, skipping demo data creation")

    except Exception as e:
        print(f"⚠️ Could not create demo data: {e}")
        db.session.rollback()


# ─────────────────────────────────────────
#  RUN
# ─────────────────────────────────────────

if __name__ == '__main__':
    with app.app_context():
        db.create_all()
        print("📦 Database tables created")

        migrate_database()
        create_demo_data()
        create_static_files()

        os.makedirs('templates', exist_ok=True)
        os.makedirs('static/css', exist_ok=True)
        os.makedirs('static/js', exist_ok=True)
        os.makedirs('uploads', exist_ok=True)

    print("\n" + "=" * 60)
    print("🚀 ShikshaSetu Server Started!")
    print("=" * 60)
    print("🌐 Available languages: English, Kannada, Hindi, Malayalam")
    print("📝 Translation system: Active")
    print("🔔 Notification system: Active")
    print("📧 Email notifications: Active")
    print("=" * 60)
    print("📍 Local URL: http://localhost:5000")
    print("=" * 60 + "\n")

    app.run(debug=True, host='0.0.0.0', port=5000)