'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { 
  ArrowLeft, 
  Award, 
  CheckCircle, 
  AlertTriangle, 
  Lightbulb, 
  TrendingUp, 
  MessageSquare, 
  BookOpen, 
  Loader2,
  Sparkles 
} from 'lucide-react';

interface TopicScore {
  topic: string;
  score: number;
}

interface InterviewAnalysis {
  communicationQuality: string;
  technicalAccuracy: string;
  confidence: string;
  strengths: string[];
  weaknesses: string[];
  suggestions: string[];
  topicScores: TopicScore[];
  overallScore: number;
  summary: string;
}

interface InterviewSession {
  _id: string;
  type: 'topic' | 'jd_resume';
  timestamp: string;
  metadata: {
    topics?: string[];
    jd?: string;
    resume?: string;
  };
  analysis?: InterviewAnalysis;
}

export default function InterviewAnalysisPage() {
  const { id } = useParams() as { id: string };
  const router = useRouter();
  const [session, setSession] = useState<InterviewSession | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchSessionDetails = async () => {
      try {
        setLoading(true);
        const res = await fetch(`/api/interview/details?id=${id}`);
        if (res.ok) {
          const data = await res.json();
          setSession(data.interview);
        } else {
          alert('Failed to retrieve interview details.');
          router.push('/');
        }
      } catch (err) {
        console.error('Error fetching details:', err);
        alert('An error occurred while retrieving evaluation details.');
        router.push('/');
      } finally {
        setLoading(false);
      }
    };

    fetchSessionDetails();
  }, [id, router]);

  if (loading) {
    return (
      <div className="app-container" style={{ alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px' }}>
          <Loader2 size={36} className="animate-spin" style={{ color: 'var(--accent-purple)' }} />
          <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 600 }}>Assembling Interview Analysis Report...</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Querying cached evaluation models from MongoDB...</p>
        </div>
      </div>
    );
  }

  if (!session || !session.analysis) {
    return (
      <div className="app-container" style={{ alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px' }}>
          <AlertTriangle size={36} style={{ color: 'var(--accent-rose)' }} />
          <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 600 }}>No Analysis Found</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Please trigger analysis from the dashboard history panel.</p>
          <button className="btn btn-primary" onClick={() => router.push('/')}>
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  const report = session.analysis;
  const dateStr = new Date(session.timestamp).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric'
  });

  return (
    <div className="app-container" style={{ overflowY: 'auto' }}>
      {/* Sidebar Info summary */}
      <aside className="sidebar">
        <div className="brand" onClick={() => router.push('/')} style={{ cursor: 'pointer' }}>
          <div className="brand-icon">A</div>
          <h1 className="brand-title">Aether</h1>
        </div>

        <div className="panel-card">
          <h2 className="panel-title">Session Details</h2>
          <div className="session-info">
            <div className="session-row">
              <span>Session ID:</span>
              <span className="session-val">{session._id}</span>
            </div>
            <div className="session-row">
              <span>Category:</span>
              <span style={{ fontWeight: 600, color: 'var(--text-active)' }}>
                {session.type === 'topic' ? 'Topic-Based' : 'JD + Resume'}
              </span>
            </div>
            <div className="session-row">
              <span>Date:</span>
              <span style={{ color: 'var(--text-active)' }}>{dateStr}</span>
            </div>
          </div>
        </div>

        <div className="panel-card" style={{ flexGrow: 1, overflow: 'hidden' }}>
          <h2 className="panel-title">Hiring Matrix</h2>
          <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', display: 'flex', flexDirection: 'column', gap: '12px', height: '100%', overflowY: 'auto' }}>
            <p>Our evaluation models analyze syntax correctness, structural alignment, technical concepts depth, speed, communication clarity, and candidate poise.</p>
            <p>Scores above 80% indicate core proficiency and autonomy in the evaluated stacks.</p>
          </div>
        </div>
      </aside>

      {/* Main Analysis stage */}
      <main className="main-stage" style={{ overflowY: 'auto' }}>
        <header className="header-bar">
          <div className="status-badge idle">
            <div className="indicator-dot" style={{ backgroundColor: 'var(--accent-emerald)', boxShadow: '0 0 10px var(--accent-emerald)' }}></div>
            <span>Screening report generated successfully</span>
          </div>

          <button className="btn" onClick={() => router.push('/')}>
            <ArrowLeft size={16} /> Back to Dashboard
          </button>
        </header>

        <section className="workspace" style={{ justifyContent: 'flex-start', padding: '48px 32px' }}>
          <div className="analysis-container">
            
            <div className="analysis-header">
              <div className="analysis-headline-group">
                <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '2rem' }}>
                  AI Technical Evaluation Report
                </h2>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.95rem' }}>
                  Complete technical assessment and competency breakdown for screening {session._id}
                </p>
              </div>
              <span className={`history-badge ${session.type}`} style={{ fontSize: '0.85rem', padding: '6px 14px' }}>
                {session.type === 'topic' ? 'Topic Screen' : 'Recruiter Screen'}
              </span>
            </div>

            <div className="analysis-grid">
              
              {/* Left Scoreboard Card */}
              <div className="analysis-aside">
                <div className="panel-card score-circle-container">
                  <div className="score-ring">
                    {report.overallScore}%
                  </div>
                  <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.15rem', fontWeight: 700, color: 'var(--accent-emerald)', marginBottom: '4px' }}>
                    Overall Rating
                  </h3>
                  <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', lineHeight: 1.3 }}>
                    Consolidated score of communication, tech understanding, and structural precision.
                  </p>
                </div>

                <div className="panel-card metric-bars-card">
                  <h3 className="panel-title" style={{ paddingBottom: '4px' }}>Behavioral Quality</h3>
                  
                  <div className="metric-bar-group">
                    <div className="metric-bar-label">
                      <span>Confidence</span>
                      <span>{report.overallScore > 60 ? 'Strong' : 'Developing'}</span>
                    </div>
                    <div className="metric-bar-bg">
                      <div className="metric-bar-fill" style={{ width: `${report.overallScore}%`, background: 'var(--accent-purple)' }}></div>
                    </div>
                  </div>

                  <div className="metric-bar-group">
                    <div className="metric-bar-label">
                      <span>Tech Foundation</span>
                      <span>{report.overallScore > 75 ? 'Proficient' : 'Intermediate'}</span>
                    </div>
                    <div className="metric-bar-bg">
                      <div className="metric-bar-fill" style={{ width: `${Math.min(100, report.overallScore + 5)}%`, background: 'var(--accent-blue)' }}></div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Right Report Details */}
              <div className="analysis-body">
                
                {/* Manager summary */}
                <div className="panel-card evaluation-block">
                  <h3>
                    <Award size={18} style={{ color: 'var(--accent-purple)' }} /> Hiring Manager Summary
                  </h3>
                  <p>{report.summary}</p>
                </div>

                {/* Specific checks */}
                <div className="panel-card evaluation-block">
                  <h3>
                    <MessageSquare size={18} style={{ color: 'var(--accent-blue)' }} /> Communication & Presentation
                  </h3>
                  <p>{report.communicationQuality}</p>
                </div>

                <div className="panel-card evaluation-block">
                  <h3>
                    <TrendingUp size={18} style={{ color: 'var(--accent-emerald)' }} /> Technical Knowledge Accuracy
                  </h3>
                  <p>{report.technicalAccuracy}</p>
                </div>

                <div className="panel-card evaluation-block">
                  <h3>
                    <Sparkles size={18} style={{ color: 'var(--accent-rose)' }} /> Delivery Poise & confidence
                  </h3>
                  <p>{report.confidence}</p>
                </div>

                {/* Strengths & Weaknesses Grids */}
                <div className="cards-columns">
                  
                  <div className="glow-card strengths">
                    <div className="glow-card-title">
                      <CheckCircle size={18} /> Highlighted Strengths
                    </div>
                    <ul className="glow-list">
                      {report.strengths.map((str, idx) => (
                        <li key={idx}>{str}</li>
                      ))}
                    </ul>
                  </div>

                  <div className="glow-card weaknesses">
                    <div className="glow-card-title">
                      <AlertTriangle size={18} /> Competency Gaps
                    </div>
                    <ul className="glow-list">
                      {report.weaknesses.map((weak, idx) => (
                        <li key={idx}>{weak}</li>
                      ))}
                    </ul>
                  </div>

                  <div className="glow-card suggestions">
                    <div className="glow-card-title">
                      <Lightbulb size={18} /> Actionable Learning Roadmap
                    </div>
                    <ul className="glow-list" style={{ paddingLeft: '24px' }}>
                      {report.suggestions.map((sug, idx) => (
                        <li key={idx} style={{ marginBottom: '4px' }}>
                          <span style={{ fontWeight: 600, color: 'var(--accent-purple)', marginRight: '4px' }}>{idx + 1}.</span>
                          {sug}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>

                {/* Skill Ratings Grid */}
                <div className="panel-card evaluation-block">
                  <h3 style={{ borderBottom: '1px solid var(--border-glass)', paddingBottom: '12px', marginBottom: '8px' }}>
                    <BookOpen size={18} style={{ color: 'var(--accent-purple)' }} /> Evaluated Technology Breakdown
                  </h3>
                  <div className="skills-scores-grid">
                    {report.topicScores.map((score, idx) => (
                      <div className="skill-score-card" key={idx}>
                        <span className="skill-score-val">{score.score}%</span>
                        <span className="skill-score-label">{score.topic}</span>
                      </div>
                    ))}
                  </div>
                </div>

              </div>

            </div>

          </div>
        </section>
      </main>
    </div>
  );
}
