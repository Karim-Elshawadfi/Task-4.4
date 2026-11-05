import React, { useState, useEffect, useMemo } from 'react';

const STORAGE_KEY = 'acl-lost-found-vibrant-v1';

const INITIAL_DATA = [
  { id: 1, title: 'iPhone 13', status: 'lost', category: 'electronics', location: 'Library 2nd Floor', description: 'Blue case, cracked screen', owner: 'other', image: 'https://images.unsplash.com/photo-1510557880182-f7ed7374972a?w=400' },
  { id: 2, title: 'Water Bottle', status: 'found', category: 'accessories', location: 'Gym Entrance', description: 'Stainless steel, red lid', owner: 'you', image: 'https://images.unsplash.com/photo-1602143396841-d7bc75a7388b?w=400' },
  { id: 3, title: 'Student ID Card', status: 'found', category: 'documents', location: 'Cafeteria', description: 'Name: John Doe', owner: 'other', image: 'https://images.unsplash.com/photo-1613726156674-7bc73e274777?w=400' },
  { id: 4, title: 'Blue Hoodie', status: 'lost', category: 'clothing', location: 'Sports Complex', description: 'Size L, Nike', owner: 'you', image: 'https://images.unsplash.com/photo-1556821840-3a63f95609a7?w=400' },
  { id: 5, title: 'Car Keys', status: 'found', category: 'accessories', location: 'Parking Lot B', description: 'Toyota key with leather strap', owner: 'other', image: 'https://images.unsplash.com/photo-1582139329536-8a4d7d57328d?w=400' },
];

const CATEGORIES = ['electronics', 'clothing', 'documents', 'accessories', 'other'];
const STATUSES = ['lost', 'found', 'claimed'];

export default function App() {
  const [items, setItems] = useState(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? JSON.parse(saved) : INITIAL_DATA;
  });

  const [filter, setFilter] = useState('');
  const [statusTab, setStatusTab] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState({ title: '', status: 'lost', category: 'other', location: '', description: '', image: '' });
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  }, [items]);

  const filteredItems = useMemo(() => {
    return items.filter(item => {
      const matchesText = item.title.toLowerCase().includes(filter.toLowerCase()) ||
                          item.description.toLowerCase().includes(filter.toLowerCase());
      const matchesStatus = statusTab === 'all' || item.status === statusTab;
      const matchesCat = categoryFilter === 'all' || item.category === categoryFilter;
      return matchesText && matchesStatus && matchesCat;
    });
  }, [items, filter, statusTab, categoryFilter]);

  const validate = (data) => {
    if (data.title.length < 2) return 'Title must be at least 2 characters.';
    const duplicate = items.find(i => i.id !== editingId && i.title.toLowerCase() === data.title.toLowerCase() && i.location === data.location);
    if (duplicate) return 'This item has already been reported at this location.';
    return null;
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    setError('');
    setNotice('');

    const validationError = validate(form);
    if (validationError) {
      setError(validationError);
      return;
    }

    if (editingId) {
      setItems(items.map(i => i.id === editingId ? { ...form, id: editingId, owner: 'you' } : i));
      setNotice('Report updated successfully!');
    } else {
      setItems([...items, { ...form, id: Date.now(), owner: 'you' }]);
      setNotice('Report posted successfully!');
    }

    setForm({ title: '', status: 'lost', category: 'other', location: '', description: '', image: '' });
    setEditingId(null);
    setTimeout(() => setNotice(''), 3000);
  };

  const handleEdit = (item) => {
    if (item.owner !== 'you') {
      setError('You can only edit your own reports.');
      return;
    }
    setEditingId(item.id);
    setForm({ ...item });
    setIsFormOpen(true);
    setError('');
  };

  const handleReset = () => {
    setItems(INITIAL_DATA);
    setNotice('Demo reset to defaults.');
    setTimeout(() => setNotice(''), 3000);
  };

  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => setForm({ ...form, image: reader.result });
      reader.readAsDataURL(file);
    }
  };

  return (
    <div className="app-shell">
      <style>{`
        :root {
          --brand: #6366f1;
          --brand-dark: #4338ca;
          --bg: #f0f4ff;
          --card: rgba(255, 255, 255, 0.8);
          --text-main: #1e293b;
          --text-muted: #64748b;
          --lost: #ef4444;
          --found: #22c55e;
          --claimed: #94a3b8;
          --border: rgba(226, 232, 240, 0.8);
        }
        body {
          margin: 0;
          font-family: 'Inter', system-ui, sans-serif;
          background: radial-gradient(circle at top left, #e0e7ff 0%, #f8fafc 40%, #fdf2f8 100%);
          color: var(--text-main);
          min-height: 100vh;
        }
        .app-shell { min-height: 100vh; display: flex; flex-direction: column; }

        .navbar {
          background: rgba(255, 255, 255, 0.7);
          backdrop-filter: blur(12px);
          padding: 1rem 2rem;
          display: flex;
          justify-content: space-between;
          align-items: center;
          border-bottom: 1px solid var(--border);
          position: sticky;
          top: 0;
          z-index: 100;
        }
        .nav-brand { display: flex; align-items: center; gap: 10px; font-size: 1.2rem; color: var(--brand); font-weight: 700; }
        .logo-icon { font-size: 1.5rem; filter: drop-shadow(0 2px 4px rgba(99, 102, 238, 0.3)); }
        .nav-actions { display: flex; gap: 12px; }

        .main-content { padding: 3rem 2rem; max-width: 1200px; margin: 0 auto; width: 100%; }

        .hero-section { text-align: center; margin-bottom: 3rem; animation: fadeInDown 0.6s ease-out; }
        .hero-section h1 {
          font-size: 3rem;
          font-weight: 800;
          margin-bottom: 1rem;
          letter-spacing: -0.03em;
          background: linear-gradient(to right, #4f46e5, #ec4899);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
        }
        .hero-section p { color: var(--text-muted); font-size: 1.2rem; max-width: 600px; margin: 0 auto; }

        .filter-bar {
          display: flex;
          flex-wrap: wrap;
          gap: 20px;
          align-items: center;
          background: rgba(255, 255, 255, 0.6);
          backdrop-filter: blur(8px);
          padding: 1.2rem;
          border-radius: 24px;
          border: 1px solid var(--border);
          margin-bottom: 2rem;
          box-shadow: 0 10px 15px -3px rgba(0,0,0,0.05);
        }
        .search-group { position: relative; flex: 1; min-width: 300px; }
        .search-icon { position: absolute; left: 15px; top: 50%; transform: translateY(-50%); color: var(--text-muted); }
        .search-group input {
          width: 100%;
          padding: 12px 12px 12px 45px;
          border: 1px solid var(--border);
          border-radius: 12px;
          font-size: 1rem;
          background: rgba(255,255,255,0.8);
          transition: all 0.2s;
        }
        .search-group input:focus { outline: none; border-color: var(--brand); box-shadow: 0 0 0 4px rgba(99, 102, 238, 0.1); }

        .tab-group { display: flex; background: #e2e8f0; padding: 5px; border-radius: 14px; gap: 5px; }
        .tab-btn {
          border: none; background: transparent; padding: 8px 20px; border-radius: 10px;
          cursor: pointer; font-size: 0.9rem; font-weight: 600; color: var(--text-muted);
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        }
        .tab-btn.active { background: white; color: var(--brand); box-shadow: 0 4px 6px rgba(0,0,0,0.1); transform: scale(1.05); }
        .cat-select { padding: 10px 15px; border: 1px solid var(--border); border-radius: 12px; background: white; color: var(--text-main); cursor: pointer; }

        .search-feedback { margin-bottom: 1.5rem; font-size: 0.95rem; color: var(--brand); font-weight: 600; animation: fadeIn 0.3s; }

        .items-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 30px; }

        .item-card {
          background: var(--card);
          border-radius: 24px;
          overflow: hidden;
          border: 1px solid var(--border);
          transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
          display: flex;
          flex-direction: column;
          backdrop-filter: blur(4px);
        }
        .item-card:hover { transform: translateY(-10px); box-shadow: 0 20px 25px -5px rgba(0,0,0,0.1), 0 10px 10px -5px rgba(0,0,0,0.04); }

        .card-image { height: 200px; position: relative; background: #cbd5e1; overflow: hidden; }
        .card-image img { width: 100%; height: 100%; object-fit: cover; transition: transform 0.5s; }
        .item-card:hover .card-image img { transform: scale(1.1); }
        .img-placeholder { height: 100%; display: grid; place-items: center; font-size: 4rem; font-weight: 800; color: #94a3b8; background: linear-gradient(135deg, #e2e8f0 0%, #cbd5e1 100%); }

        .status-tag {
          position: absolute; top: 15px; right: 15px; padding: 6px 14px; border-radius: 50px;
          font-size: 0.75rem; font-weight: 800; text-transform: uppercase; color: white;
          z-index: 10; box-shadow: 0 4px 6px rgba(0,0,0,0.1);
        }
        .status-tag.lost { background: linear-gradient(45deg, #ef4444, #f87171); }
        .status-tag.found { background: linear-gradient(45deg, #22c55e, #4ade80); }
        .status-tag.claimed { background: linear-gradient(45deg, #64748b, #94a3b8); }

        .card-body { padding: 1.5rem; }
        .card-top { display: flex; justify-content: space-between; align-items: start; margin-bottom: 12px; }
        .card-top h3 { margin: 0; font-size: 1.25rem; color: var(--text-main); font-weight: 700; }
        .cat-badge { font-size: 0.7rem; background: #eef2ff; padding: 4px 10px; border-radius: 6px; color: var(--brand); font-weight: 600; text-transform: uppercase; }
        .loc-text { font-size: 0.9rem; color: var(--text-muted); margin: 0 0 12px 0; display: flex; align-items: center; gap: 5px; }
        .desc-text { font-size: 0.95rem; line-height: 1.6; color: #475569; margin-bottom: 1.5rem; min-height: 3em; }

        .edit-btn {
          width: 100%; padding: 10px; background: white; border: 1px solid var(--border);
          border-radius: 12px; cursor: pointer; font-size: 0.9rem; font-weight: 600;
          transition: all 0.2s; color: var(--text-main);
        }
        .edit-btn:hover { background: var(--brand); color: white; border-color: var(--brand); transform: scale(1.02); }

        .modal-overlay {
          position: fixed; inset: 0; background: rgba(15, 23, 42, 0.6);
          backdrop-filter: blur(8px); display: grid; place-items: center; z-index: 1000; padding: 20px;
          animation: fadeIn 0.3s ease;
        }
        .modal-card {
          background: white; width: 100%; max-width: 600px; border-radius: 32px;
          padding: 2.5rem; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.3);
          animation: slideUp 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
        }
        .modal-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 2rem; }
        .modal-header h2 { margin: 0; font-size: 1.75rem; font-weight: 800; }
        .close-btn { background: none; border: none; font-size: 2rem; cursor: pointer; color: var(--text-muted); transition: color 0.2s; }
        .close-btn:hover { color: var(--lost); }

        .form-row { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 20px; }
        .form-group { margin-bottom: 1.5rem; display: flex; flex-direction: column; }
        .form-group label { font-size: 0.9rem; font-weight: 600; margin-bottom: 8px; color: var(--text-main); }
        .form-group input, .form-group select, .form-group textarea {
          padding: 12px; border: 1px solid var(--border); border-radius: 12px;
          font-size: 1rem; outline: none; transition: all 0.2s; background: #fcfcfe;
        }
        .form-group input:focus { border-color: var(--brand); box-shadow: 0 0 0 4px rgba(99, 102, 238, 0.1); }

        .upload-box {
          border: 2px dashed var(--border); border-radius: 16px; height: 140px;
          display: grid; place-items: center; transition: all 0.3s; overflow: hidden;
          background: #f8fafc;
        }
        .upload-box:hover { border-color: var(--brand); background: #eff6ff; }
        .upload-label { text-align: center; color: var(--text-muted); font-size: 0.9rem; cursor: pointer; width: 100%; height: 100%; display: grid; place-items: center; }
        .preview-img { width: 100%; height: 100%; object-fit: cover; }

        .modal-footer { display: flex; justify-content: flex-end; gap: 15px; margin-top: 1rem; }

        .btn-primary {
          background: linear-gradient(45deg, var(--brand), var(--brand-dark));
          color: white; border: none; padding: 12px 24px; border-radius: 12px;
          font-weight: 700; cursor: pointer; transition: all 0.3s;
          box-shadow: 0 4px 12px rgba(99, 102, 238, 0.3);
        }
        .btn-primary:hover { transform: translateY(-2px); box-shadow: 0 6px 20px rgba(99, 102, 238, 0.4); }
        .btn-secondary {
          background: white; color: var(--text-main); border: 1px solid var(--border);
          padding: 12px 24px; border-radius: 12px; font-weight: 600; cursor: pointer;
          transition: all 0.2s;
        }
        .btn-secondary:hover { background: #f8fafc; border-color: #cbd5e1; }

        .error-alert { background: #fef2f2; color: #dc2626; padding: 12px; border-radius: 12px; margin-bottom: 1rem; border: 1px solid #fecaca; font-size: 0.9rem; }
        .success-alert { background: #f0fdf4; color: #16a34a; padding: 12px; border-radius: 12px; margin-bottom: 1rem; border: 1px solid #bbf7d0; font-size: 0.9rem; }

        .empty-state { grid-column: 1 / -1; text-align: center; padding: 5rem 0; }
        .empty-icon { font-size: 5rem; display: block; margin-bottom: 1.5rem; animation: float 3s ease-in-out infinite; }

        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes fadeInDown { from { opacity: 0; transform: translateY(-20px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes slideUp { from { opacity: 0; transform: translateY(30px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes float { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-20px); } }
      `}</style>
      <nav className="navbar">
        <div className="nav-brand">
          <span className="logo-icon">🔍</span>
          <strong>Campus Lost & Found</strong>
        </div>
        <div className="nav-actions">
          <button className="btn-secondary" onClick={handleReset}>Reset Demo</button>
          <button className="btn-primary" onClick={() => { setEditingId(null); setForm({ title: '', status: 'lost', category: 'other', location: '', description: '', image: '' }); setIsFormOpen(true); }}>
            + Post a Report
          </button>
        </div>
      </nav>

      <main className="main-content">
        <section className="hero-section">
          <h1>Find what was lost, <br/>Return what was found.</h1>
          <p>Helping the campus community recover belongings through a transparent and efficient reporting system.</p>
        </section>

        <div className="filter-bar">
          <div className="search-group">
            <span className="search-icon">🔍</span>
            <input
              type="text"
              placeholder="Search by item or description..."
              value={filter}
              onChange={e => setFilter(e.target.value)}
            />
          </div>
          <div className="tab-group">
            {['all', 'lost', 'found', 'claimed'].map(tab => (
              <button
                key={tab}
                className={`tab-btn ${statusTab === tab ? 'active' : ''}`}
                onClick={() => setStatusTab(tab)}
              >
                {tab.charAt(0).toUpperCase() + tab.slice(1)}
              </button>
            ))}
          </div>
          <select className="cat-select" value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)}>
            <option value="all">All Categories</option>
            {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>

        {filter && <div className="search-feedback">Showing {filteredItems.length} results for "{filter}"</div>}

        <div className="items-grid">
          {filteredItems.map(item => (
            <div key={item.id} className={`item-card ${item.status}`}>
              <div className="card-image">
                {item.image ? (
                  <img
                    src={item.image}
                    alt={item.title}
                    onError={(e) => { e.target.style.display = 'none'; e.target.nextSibling.style.display = 'grid'; }}
                  />
                ) : null}
                <div
                  className="img-placeholder"
                  style={{ display: item.image ? 'none' : 'grid' }}
                >
                  {item.title[0]}
                </div>
                <span className={`status-tag ${item.status}`}>{item.status}</span>
              </div>
              <div className="card-body">
                <div className="card-top">
                  <h3>{item.title}</h3>
                  <span className="cat-badge">{item.category}</span>
                </div>
                <p className="loc-text">📍 {item.location || 'Unknown Location'}</p>
                <p className="desc-text">{item.description || 'No description provided.'}</p>
                {item.owner === 'you' && (
                  <button className="edit-btn" onClick={() => handleEdit(item)}>Edit My Report</button>
                )}
              </div>
            </div>
          ))}
          {filteredItems.length === 0 && (
            <div className="empty-state">
              <span className="empty-icon">📦</span>
              <h3>No items found</h3>
              <p>Try adjusting your filters or search terms.</p>
              <button className="btn-secondary" onClick={() => {setFilter(''); setStatusTab('all'); setCategoryFilter('all');}}>Clear All Filters</button>
            </div>
          )}
        </div>
      </main>

      {isFormOpen && (
        <div className="modal-overlay">
          <div className="modal-card">
            <div className="modal-header">
              <h2>{editingId ? 'Update Your Report' : 'Create New Report'}</h2>
              <button className="close-btn" onClick={() => setIsFormOpen(false)}>&times;</button>
            </div>

            {error && <div className="error-alert">{error}</div>}
            {notice && <div className="success-alert">{notice}</div>}

            <form onSubmit={handleSubmit}>
              <div className="form-row">
                <div className="form-group">
                  <label>Item Title *</label>
                  <input required value={form.title} onChange={e => setForm({...form, title: e.target.value})} placeholder="e.g. Blue Nike Backpack" />
                </div>
                <div className="form-group">
                  <label>Status</label>
                  <select value={form.status} onChange={e => setForm({...form, status: e.target.value})}>
                    {STATUSES.map(s => <option key={s} value={s}>{s.toUpperCase()}</option>)}
                  </select>
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>Category</label>
                  <select value={form.category} onChange={e => setForm({...form, category: e.target.value})}>
                    {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label>Location</label>
                  <input value={form.location} onChange={e => setForm({...form, location: e.target.value})} placeholder="e.g. Student Union" />
                </div>
              </div>

              <div className="form-group">
                <label>Item Photo</label>
                <div className="upload-box">
                  <input type="file" accept="image/*" onChange={handleImageUpload} id="file-up" hidden />
                  <label htmlFor="file-up" className="upload-label">
                    {form.image ? <img src={form.image} alt="Preview" className="preview-img" /> : <span>📷 Upload photo of item</span>}
                  </label>
                </div>
              </div>

              <div className="form-group">
                <label>Description</label>
                <textarea rows="3" value={form.description} onChange={e => setForm({...form, description: e.target.value})} placeholder="Provide details like color, brand, or identifying marks..."></textarea>
              </div>

              <div className="modal-footer">
                <button type="button" className="btn-secondary" onClick={() => setIsFormOpen(false)}>Cancel</button>
                <button type="submit" className="btn-primary">
                  {editingId ? 'Save Changes' : 'Post Report'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
