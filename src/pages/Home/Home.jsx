import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, getDocs, addDoc } from 'firebase/firestore';
import { db } from '../../services/firebase';
import './home.css';

const Home = () => {
  const navigate = useNavigate();
  const [empresas, setEmpresas] = useState([]);
  const [modalAberto, setModalAberto] = useState(false);
  const [loading, setLoading] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [novaEmpresa, setNovaEmpresa] = useState({ name: '', cnpj: '', logo: null });

  useEffect(() => {
    carregarEmpresas();
  }, []);

  const carregarEmpresas = async () => {
    try {
      const snapshot = await getDocs(collection(db, 'empresas'));
      const lista = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setEmpresas(lista);
    } catch (error) {
      console.error('Erro ao carregar empresas:', error);
    } finally {
      setLoading(false);
    }
  };

  const salvarEmpresa = async () => {
    if (!novaEmpresa.name || !novaEmpresa.cnpj) return alert('Preencha nome e CNPJ!');
    setSalvando(true);
    try {
      let logoBase64 = '';
      if (novaEmpresa.logo) {
        logoBase64 = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
              const canvas = document.createElement('canvas');
              const MAX = 200;
              let w = img.width;
              let h = img.height;
              if (w > h) { h = (h / w) * MAX; w = MAX; }
              else { w = (w / h) * MAX; h = MAX; }
              canvas.width = w;
              canvas.height = h;
              canvas.getContext('2d').drawImage(img, 0, 0, w, h);
              resolve(canvas.toDataURL('image/webp', 0.7));
            };
            img.onerror = reject;
            img.src = e.target.result;
          };
          reader.onerror = reject;
          reader.readAsDataURL(novaEmpresa.logo);
        });
      }
      await addDoc(collection(db, 'empresas'), {
        name: novaEmpresa.name,
        cnpj: novaEmpresa.cnpj,
        logo: logoBase64,
        criadoEm: new Date()
      });
      setNovaEmpresa({ name: '', cnpj: '', logo: null });
      setModalAberto(false);
      await carregarEmpresas();
    } catch (error) {
      console.error('Erro ao salvar empresa:', error);
      alert('Erro ao salvar empresa!');
    } finally {
      setSalvando(false);
    }
  };

  return (
    <main className="home-content">
      <div className="home-header">
        <h1 className="os-title">Gestão de Unidades</h1>
        <button className="btn-nova-empresa" onClick={() => setModalAberto(true)}>+ Nova Empresa</button>
      </div>

      {loading ? (
        <p style={{color: 'rgba(255,255,255,0.5)', textAlign: 'center', marginTop: '60px'}}>Carregando...</p>
      ) : (
        <div className="os-grid">
          {empresas.map((emp) => (
            <div
              key={emp.id}
              className="os-card"
              onClick={() => navigate(`/empresa/${emp.id}`, { state: emp })}
            >
              <div className="os-icon-container">
                {emp.logo
                  ? <img src={emp.logo} className="os-logo-img" alt={emp.name} />
                  : <span style={{fontSize: '2rem'}}>🏢</span>
                }
              </div>
              <span className="os-name">{emp.name}</span>
              <span className="os-cnpj">{emp.cnpj}</span>
            </div>
          ))}
        </div>
      )}

      {modalAberto && (
        <div className="modal-overlay" onClick={() => setModalAberto(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <button className="modal-close-x" onClick={() => setModalAberto(false)}>&times;</button>
            <h3 style={{color: '#fff', marginBottom: '24px'}}>Nova Empresa</h3>

            <div className="campo">
              <label>Nome da Empresa</label>
              <input
                type="text"
                placeholder="Ex: COOPED"
                value={novaEmpresa.name}
                onChange={e => setNovaEmpresa({...novaEmpresa, name: e.target.value})}
              />
            </div>

            <div className="campo">
              <label>CNPJ</label>
              <input
                type="text"
                placeholder="Ex: 01.052.748/0001-09"
                value={novaEmpresa.cnpj}
                onChange={e => setNovaEmpresa({...novaEmpresa, cnpj: e.target.value})}
              />
            </div>

            <div className="campo">
              <label>Logo (imagem)</label>
              <input
                type="file"
                accept="image/*"
                onChange={e => setNovaEmpresa({...novaEmpresa, logo: e.target.files[0]})}
              />
            </div>

            <button className="btn-salvar" onClick={salvarEmpresa} disabled={salvando}>
              {salvando ? 'Salvando...' : 'Salvar Empresa'}
            </button>
          </div>
        </div>
      )}
    </main>
  );
};

export default Home;