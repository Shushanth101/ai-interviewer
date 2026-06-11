'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { 
  Play, 
  BookOpen, 
  FileText, 
  RotateCcw, 
  History, 
  Trash2, 
  Plus, 
  Loader2, 
  ChevronRight, 
  Clock 
} from 'lucide-react';

const TOPIC_PRESETS = [
  'React',
  'Node.js',
  'DBMS',
  'System Design',
  'DSA',
  'Web Security',
  'Microservices',
  'JavaScript',
  'Cloud Architecture',
  'API Design',
  'PostgreSQL',
  'MongoDB',
  'MySQL',
  'Git & GitHub',
  'HTML',
  'CSS',
];

interface InterviewMetadata {
  topics?: string[];
  jd?: string;
  resume?: string;
}

interface TranscriptEntry {
  role: 'system' | 'user' | 'assistant';
  content: string;
  timestamp: string;
}

interface InterviewSession {
  _id: string;
  type: 'topic' | 'jd_resume';
  timestamp: string;
  metadata: InterviewMetadata;
  transcript: TranscriptEntry[];
  analysis?: any;
}

export default function Dashboard() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<'topic' | 'jd_resume'>('topic');
  
  // Topic selection state
  const [selectedTopics, setSelectedTopics] = useState<string[]>([]);
  
  // JD/Resume state
  const [jdText, setJdText] = useState('');
  const [resumeText, setResumeText] = useState('');
  
  // App state
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState<InterviewSession[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);
  
  // Transcript Modal state
  const [activeTranscriptSession, setActiveTranscriptSession] = useState<InterviewSession | null>(null);
  
  // Analysis loader per session
  const [analyzingSessionId, setAnalyzingSessionId] = useState<string | null>(null);

  // Delete loader per session
  const [deletingSessionId, setDeletingSessionId] = useState<string | null>(null);

  // Fetch past interviews
  const fetchHistory = async () => {
    try {
      setLoadingHistory(true);
      const res = await fetch('/api/interview/history');
      if (res.ok) {
        const data = await res.json();
        setHistory(data.interviews || []);
      }
    } catch (err) {
      console.error('Error fetching interview history:', err);
    } finally {
      setLoadingHistory(false);
    }
  };

  useEffect(() => {
    fetchHistory();
  }, []);

  const handleTopicToggle = (topic: string) => {
    if (selectedTopics.includes(topic)) {
      setSelectedTopics(selectedTopics.filter(t => t !== topic));
    } else {
      setSelectedTopics([...selectedTopics, topic]);
    }
  };

  const handleStartInterview = async () => {
    setLoading(true);
    try {
      const payload: any = { type: activeTab };
      if (activeTab === 'topic') {
        if (selectedTopics.length === 0) {
          alert('Please select at least one topic to begin.');
          setLoading(false);
          return;
        }
        payload.topics = selectedTopics;
      } else {
        if (!jdText.trim() || !resumeText.trim()) {
          alert('Please paste both the Job Description and Resume to begin.');
          setLoading(false);
          return;
        }
        payload.jd = jdText;
        payload.resume = resumeText;
      }

      const res = await fetch('/api/interview/initialize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!res.ok) throw new Error('Failed to initialize session');
      const data = await res.json();
      
      // Redirect to the dedicated live interview page
      router.push(`/interview/${data.id}`);
    } catch (err) {
      console.error(err);
      alert('Failed to initialize interview session. Please try again.');
      setLoading(false);
    }
  };

  const handleAnalyze = async (session: InterviewSession) => {
    // If already analyzed, go straight to report
    if (session.analysis) {
      router.push(`/interview/${session._id}/analysis`);
      return;
    }

    setAnalyzingSessionId(session._id);
    try {
      const res = await fetch('/api/interview/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chatId: session._id })
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Analysis failed');
      }
      
      router.push(`/interview/${session._id}/analysis`);
    } catch (err: any) {
      console.error(err);
      alert(`AI Analysis failed: ${err.message}. Ensure you spoke enough in the interview.`);
    } finally {
      setAnalyzingSessionId(null);
    }
  };

  const handleDeleteSession = async (session: InterviewSession) => {
    if (!confirm(`Delete session ${session._id}? This cannot be undone.`)) return;

    setDeletingSessionId(session._id);
    try {
      const res = await fetch(`/api/interview/delete?id=${session._id}`, {
        method: 'DELETE',
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'Delete failed');
      }

      // Optimistically remove from local state
      setHistory(prev => prev.filter(s => s._id !== session._id));
    } catch (err: any) {
      console.error(err);
      alert(`Failed to delete session: ${err.message}`);
    } finally {
      setDeletingSessionId(null);
    }
  };

  return (
    <div className="app-container">
      {/* Sidebar navigation and metadata details */}
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-icon">A</div>
          <h1 className="brand-title">Aether</h1>
        </div>

        <div className="panel-card">
          <h2 className="panel-title">System Status</h2>
          <div className="session-info">
            <div className="session-row">
              <span>Voice Engine:</span>
              <span style={{ color: 'var(--accent-emerald)', fontWeight: 600 }}>Supertonic TTS</span>
            </div>
            <div className="session-row">
              <span>LLM Core:</span>
              <span style={{ color: 'var(--accent-purple)', fontWeight: 600 }}>Groq 120B</span>
            </div>
            <div className="session-row">
              <span>Database:</span>
              <span style={{ color: 'var(--accent-blue)', fontWeight: 600 }}>MongoDB</span>
            </div>
          </div>
        </div>

        <div className="panel-card" style={{ flexGrow: 1, overflow: 'hidden' }}>
          <h2 className="panel-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <History size={16} /> Console History
          </h2>
          <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', display: 'flex', flexDirection: 'column', gap: '12px', height: '100%', overflowY: 'auto' }}>
            <p>Select your preferred mode, initialize your customized technical screen, and boot up your audio input to begin speaking hands-free.</p>
            <p>Every session transcript is cached immediately inside MongoDB. Evaluations can be triggered on demand via the "Analyze" dashboard.</p>
          </div>
        </div>
      </aside>

      {/* Main workspace */}
      <main className="main-stage" style={{ overflowY: 'auto' }}>
        <header className="header-bar">
          <div className="status-badge idle">
            <div className="indicator-dot"></div>
            <span>System ready. Select a mode to begin.</span>
          </div>

          <div className="mode-tabs">
            <button 
              className={`tab-btn ${activeTab === 'topic' ? 'active' : ''}`}
              onClick={() => setActiveTab('topic')}
            >
              <BookOpen size={14} /> Topic Interview
            </button>
            <button 
              className={`tab-btn ${activeTab === 'jd_resume' ? 'active' : ''}`}
              onClick={() => setActiveTab('jd_resume')}
            >
              <FileText size={14} /> JD + Resume
            </button>
          </div>
        </header>

        <section className="workspace" style={{ justifyContent: 'flex-start', padding: '48px 32px' }}>
          <div className="setup-container">
            <div className="setup-header">
              <h2 className="setup-title">
                {activeTab === 'topic' ? 'Topic-Based Screenings' : 'Targeted JD & Resume Screens'}
              </h2>
              <p className="setup-subtitle">
                {activeTab === 'topic' 
                  ? 'Select one or more technologies below. The AI will ask highly tailored technical questions restricted to these domains.'
                  : 'Paste the Job Description and your Resume. The AI will analyze them and conduct a highly realistic recruiter screening.'
                }
              </p>
            </div>

            <div className="setup-card">
              {activeTab === 'topic' ? (
                <div className="field-group">
                  <span className="field-label">Available Knowledge Domains</span>
                  <div className="topic-grid">
                    {TOPIC_PRESETS.map((topic) => {
                      const isSelected = selectedTopics.includes(topic);
                      return (
                        <div 
                          key={topic}
                          className={`topic-pill ${isSelected ? 'selected' : ''}`}
                          onClick={() => handleTopicToggle(topic)}
                        >
                          {topic}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <>
                  <div className="field-group">
                    <label className="field-label" htmlFor="jdInput">Job Description (JD)</label>
                    <textarea 
                      id="jdInput"
                      className="field-textarea"
                      placeholder="Paste the target Job Description (role requirements, technical stack, expectations)..."
                      value={jdText}
                      onChange={(e) => setJdText(e.target.value)}
                    />
                  </div>
                  <div className="field-group">
                    <label className="field-label" htmlFor="resumeInput">Candidate Resume</label>
                    <textarea 
                      id="resumeInput"
                      className="field-textarea"
                      placeholder="Paste the candidate's Resume details (professional experiences, technology stacks, achievements)..."
                      value={resumeText}
                      onChange={(e) => setResumeText(e.target.value)}
                    />
                  </div>
                </>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '16px', marginTop: '8px' }}>
                <button 
                  className="btn btn-primary"
                  onClick={handleStartInterview}
                  disabled={loading}
                  style={{ minWidth: '180px', justifyContent: 'center' }}
                >
                  {loading ? (
                    <>
                      <Loader2 size={16} className="animate-spin" /> Initializing...
                    </>
                  ) : (
                    <>
                      <Play size={16} fill="currentColor" /> Start Interview
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Past interviews logs */}
            <div style={{ marginTop: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.25rem', fontWeight: 600 }}>Past Screening Sessions</h3>
              
              {loadingHistory ? (
                <div style={{ display: 'flex', justifyContent: 'center', padding: '48px' }}>
                  <Loader2 size={24} className="animate-spin" style={{ color: 'var(--accent-purple)' }} />
                </div>
              ) : history.length === 0 ? (
                <div className="panel-card" style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
                  No past sessions found. Start your first AI interview screening above!
                </div>
              ) : (
                <div className="history-grid">
                  {history.map((session) => {
                    const dateStr = new Date(session.timestamp).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit'
                    });

                    return (
                      <div className="history-card" key={session._id}>
                        <div className="history-card-header">
                          <span className={`history-badge ${session.type}`}>
                            {session.type === 'topic' ? 'Topic-Based' : 'JD + Resume'}
                          </span>
                          <span className="history-time">{dateStr}</span>
                        </div>

                        <div className="history-metadata">
                          {session.type === 'topic' ? (
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                              {session.metadata.topics?.map(t => (
                                <span key={t} style={{ background: 'rgba(255,255,255,0.04)', padding: '2px 8px', borderRadius: '4px', fontSize: '0.78rem' }}>
                                  {t}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                              Tailored screening matching candidate experiences to Job description.
                            </span>
                          )}
                        </div>

                        <div className="history-actions">
                          <button 
                            className="btn" 
                            style={{ fontSize: '0.8rem', padding: '6px 12px' }}
                            onClick={() => setActiveTranscriptSession(session)}
                          >
                            Transcript
                          </button>
                          
                          <button 
                            className={`btn ${session.analysis ? 'btn-primary' : ''}`}
                            style={{ fontSize: '0.8rem', padding: '6px 12px', minWidth: '90px', justifyContent: 'center' }}
                            onClick={() => handleAnalyze(session)}
                            disabled={analyzingSessionId !== null || deletingSessionId !== null}
                          >
                            {analyzingSessionId === session._id ? (
                              <Loader2 size={12} className="animate-spin" />
                            ) : session.analysis ? (
                              'View Report'
                            ) : (
                              'Analyze'
                            )}
                          </button>

                          <button
                            className="btn btn-danger"
                            style={{ fontSize: '0.8rem', padding: '6px 12px', minWidth: '36px', justifyContent: 'center' }}
                            onClick={() => handleDeleteSession(session)}
                            disabled={deletingSessionId !== null || analyzingSessionId !== null}
                            title="Delete session"
                          >
                            {deletingSessionId === session._id ? (
                              <Loader2 size={12} className="animate-spin" />
                            ) : (
                              <Trash2 size={12} />
                            )}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </section>
      </main>

      {/* Transcript Modal Viewer Overlay */}
      {activeTranscriptSession && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100vw',
          height: '100vh',
          backgroundColor: 'rgba(0,0,0,0.8)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 100,
          backdropFilter: 'blur(10px)'
        }}>
          <div className="panel-card" style={{
            width: '90%',
            maxWidth: '700px',
            maxHeight: '80%',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-glass)', paddingBottom: '12px' }}>
              <h2 className="panel-title" style={{ border: 'none', padding: 0 }}>
                Screening Transcript ({activeTranscriptSession._id})
              </h2>
              <button 
                className="btn" 
                style={{ padding: '4px 8px', fontSize: '0.78rem' }}
                onClick={() => setActiveTranscriptSession(null)}
              >
                Close
              </button>
            </div>
            
            <div style={{ flexGrow: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '16px', paddingRight: '8px' }}>
              {activeTranscriptSession.transcript
                .filter(m => m.role !== 'system')
                .map((msg, idx) => (
                  <div key={idx} style={{
                    alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
                    maxWidth: '85%',
                    backgroundColor: msg.role === 'user' ? 'var(--bg-tertiary)' : 'rgba(139, 92, 246, 0.08)',
                    border: msg.role === 'user' ? '1px solid var(--border-glass)' : '1px solid rgba(139, 92, 246, 0.15)',
                    borderRadius: '12px',
                    padding: '12px 16px',
                    fontSize: '0.88rem'
                  }}>
                    <div style={{
                      fontWeight: 600,
                      fontSize: '0.75rem',
                      textTransform: 'uppercase',
                      color: msg.role === 'user' ? 'var(--accent-blue)' : 'var(--accent-purple)',
                      marginBottom: '4px'
                    }}>
                      {msg.role === 'user' ? 'Candidate' : 'Interviewer'}
                    </div>
                    <div style={{ color: 'var(--text-primary)', lineHeight: 1.4 }}>{msg.content}</div>
                  </div>
                ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
