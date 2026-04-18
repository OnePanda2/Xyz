import React, { useEffect, useState } from 'react';
import { pb } from './pocketbase';
import { PieChart, Users, Hash, Smartphone, Loader2, LayoutDashboard, Lock } from 'lucide-react';

export default function App() {
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isPaid, setIsPaid] = useState(localStorage.getItem('scrollsense_access') === 'true');

  useEffect(() => {
    async function fetchLatestReport() {
      try {
        // Fetch the single latest report
        const result = await pb.collection('reports').getList(1, 1, {
          sort: '-created'
        });

        if (result.items.length === 0) throw new Error("No reports found.");
        const data = result.items[0];
        
        // Supabase/PocketBase JSONB comes back as an object, but if we stored it as a string we parse it
        let parsedSummary = data.summary;
        if (typeof parsedSummary === 'string') {
          parsedSummary = JSON.parse(parsedSummary);
        }
        
        setReport({ ...data, summary: parsedSummary });
      } catch (err) {
        console.error("Error fetching report:", err);
        setError("Failed to generate or fetch the latest insight report.");
      } finally {
        setLoading(false);
      }
    }

    if (isPaid) {
      fetchLatestReport();
    } else {
      setLoading(false);
    }
  }, [isPaid]);

  const handlePayment = async () => {
    try {
      const backendUrl = import.meta.env.VITE_BACKEND_URL;
      const res = await fetch(`${backendUrl}/create-order`, { method: 'POST' });
      const orderData = await res.json();
      
      if (!orderData.success) throw new Error('Order creation failed');
      
      const options = {
        key: import.meta.env.VITE_RAZORPAY_KEY_ID,
        amount: orderData.amount,
        currency: "INR",
        name: "ScrollSense Insights",
        description: "Premium Agency Report Access",
        order_id: orderData.order_id,
        handler: async function (response) {
          const verifyRes = await fetch(`${backendUrl}/verify-payment`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature
            })
          });
          const verifyData = await verifyRes.json();
          if (verifyData.success) {
            localStorage.setItem('scrollsense_access', 'true');
            setLoading(true); // show loader briefly while fetching
            setIsPaid(true);
          } else {
            alert('Payment verification failed. Please contact support.');
          }
        },
        theme: { color: "#8b5cf6" }
      };
      
      const rzp = new window.Razorpay(options);
      rzp.open();
    } catch (err) {
      console.error(err);
      alert('Could not initiate payment. Ensure backend is running.');
    }
  };

  if (loading) {
    return (
      <div className="loading">
        <Loader2 size={48} className="spinner" />
        <h2 style={{ fontFamily: 'Outfit' }}>Analyzing Data Models...</h2>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container" style={{ textAlign: 'center', marginTop: '10vh' }}>
        <div className="glass-panel" style={{ display: 'inline-block', borderColor: 'rgba(239, 68, 68, 0.3)' }}>
          <h2 style={{ color: '#ef4444', marginBottom: '1rem' }}>Connection Failed</h2>
          <p>{error}</p>
          <p style={{ marginTop: '1rem', color: 'var(--text-secondary)' }}>Check your .env access keys and ensure PocketBase is populated.</p>
        </div>
      </div>
    );
  }

  if (!isPaid) {
    return (
      <div className="container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '80vh' }}>
        <div className="glass-panel" style={{ maxWidth: '28rem', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1.5rem', padding: '3rem 2rem' }}>
          <Lock size={48} color="var(--accent)" />
          <div>
            <h2 style={{ fontFamily: 'Outfit', fontWeight: '700', fontSize: '1.8rem' }}>Unlock Access</h2>
            <p style={{ color: 'var(--text-secondary)', marginTop: '0.5rem' }}>Get complete demographic insights on short-form social content behavior.</p>
          </div>
          <button 
            onClick={handlePayment} 
            style={{ 
              backgroundColor: 'var(--accent)', 
              color: '#fff', 
              border: 'none', 
              padding: '1rem 2rem', 
              borderRadius: '99px',
              fontFamily: 'Inter',
              fontWeight: '600',
              fontSize: '1rem',
              cursor: 'pointer',
              width: '100%',
              transition: 'all 0.2s'
            }}>
            Pay ₹1 to Unlock
          </button>
        </div>
      </div>
    );
  }

  // Format Date gracefully
  const generatedDate = report?.created ? new Date(report.created).toLocaleString('en-US', {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit'
  }) : 'Unknown';

  return (
    <div className="container">
      <header className="header">
        <div className="header-title">
          <h1>ScrollSense Insights</h1>
          <p>AI-Powered Social Consumption Report (Generated: {generatedDate})</p>
        </div>
        <div className="glass-panel" style={{ padding: '0.75rem 1.5rem', display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <LayoutDashboard size={20} color="var(--accent)" />
          <span style={{ fontWeight: 600 }}>Agency Dashboard</span>
        </div>
      </header>

      <h2 style={{ marginBottom: '1.5rem', color: 'var(--text-secondary)' }}>
        Demographic Filters (Filtered by {report.demographic_filter?.type})
      </h2>

      <div className="dashboard-grid">
        {report.summary.map((demoData, idx) => (
          <div key={idx} className="glass-panel demo-card">
            <div className="demo-header">
              <Users size={24} />
              <h3 className="demo-title">{demoData.demographic}</h3>
            </div>
            
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '1rem' }}>
              Currently Tracking {demoData.users_tracked} user(s).
            </p>

            <hr />
            
            <h4 className="section-title">Forwarded Niches</h4>
            <div className="metrics-container">
              {demoData.niches.length === 0 ? <p className="metric-label">No data yet</p> : null}
              {demoData.niches.map((niche, i) => (
                <div key={i} className="metric-row">
                  <span className="metric-label"><PieChart size={16} /> {niche.name}</span>
                  <span className="metric-value">{niche.count}</span>
                </div>
              ))}
            </div>

            <hr />

            <h4 className="section-title">Platform Preference</h4>
            <div className="metrics-container">
              {demoData.platforms.length === 0 ? <p className="metric-label">No data yet</p> : null}
              {demoData.platforms.map((plat, i) => (
                <div key={i} className="metric-row">
                  <span className="metric-label"><Smartphone size={16} /> {plat.name}</span>
                  <span className="metric-value">{plat.count}</span>
                </div>
              ))}
            </div>

          </div>
        ))}
      </div>
    </div>
  );
}
