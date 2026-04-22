import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, getDocs, addDoc, deleteDoc, doc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import Swal from 'sweetalert2';
import { db, storage } from '../../services/firebase';
import './home.css';

const swalDark = Swal.mixin({
  background: '#1e293b',
  color: '#fff',
  confirmButtonColor: '#3b82f6',
  customClass: { cancelButton: 'swal-cancel-btn' }
});

const MESES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

const Home = () => {
  const navigate = useNavigate();
  const [empresas, setEmpresas] = useState([]);
  const [modalAberto, setModalAberto] = useState(false);
  const [loading, setLoading] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [novaEmpresa, setNovaEmpresa] = useState({ name: '', cnpj: '', logo: null });

  const [calendarioAberto, setCalendarioAberto] = useState(false);
  const [editais, setEditais] = useState([]);
  const [mesSelecionado, setMesSelecionado] = useState(null);
  const [diaSelecionado, setDiaSelecionado] = useState(null);
  const [modalNovoEdital, setModalNovoEdital] = useState(false);
  const [novoEdital, setNovoEdital] = useState({ titulo: '', empresaId: '', dataPublicacao: '', arquivo: null });
  const [salvandoEdital, setSalvandoEdital] = useState(false);
  const [uploadandoEdital, setUploadandoEdital] = useState(false);
  const calendarioRef = useRef(null);

  const anoAtual = new Date().getFullYear();

  useEffect(() => {
    carregarEmpresas();
    carregarEditais();
  }, []);

  useEffect(() => {
    const handleClickFora = (e) => {
      if (calendarioRef.current && !calendarioRef.current.contains(e.target)) {
        setCalendarioAberto(false);
        setMesSelecionado(null);
        setDiaSelecionado(null);
      }
    };
    if (calendarioAberto) document.addEventListener('mousedown', handleClickFora);
    return () => document.removeEventListener('mousedown', handleClickFora);
  }, [calendarioAberto]);

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

  const carregarEditais = async () => {
    try {
      const snapshot = await getDocs(collection(db, 'editais'));
      const lista = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      const hoje = new Date();
      const anoAtualNum = hoje.getFullYear();
      const expirados = lista.filter(e => {
        const ano = new Date(e.dataPublicacao).getFullYear();
        return ano < anoAtualNum;
      });
      for (const e of expirados) {
        if (e.storagePath) {
          await deleteObject(ref(storage, e.storagePath)).catch(() => {});
        }
        await deleteDoc(doc(db, 'editais', e.id));
      }
      setEditais(lista.filter(e => new Date(e.dataPublicacao).getFullYear() >= anoAtualNum));
    } catch (error) {
      console.error('Erro ao carregar editais:', error);
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
              let w = img.width, h = img.height;
              if (w > h) { h = (h / w) * MAX; w = MAX; }
              else { w = (w / h) * MAX; h = MAX; }
              canvas.width = w; canvas.height = h;
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

  const salvarEdital = async () => {
    if (!novoEdital.empresaId || !novoEdital.dataPublicacao || !novoEdital.arquivo) {
      return swalDark.fire({ icon: 'warning', title: 'Atenção', text: 'Preencha todos os campos e anexe o PDF!' });
    }
    setSalvandoEdital(true);
    setUploadandoEdital(true);
    try {
      const empresa = empresas.find(e => e.id === novoEdital.empresaId);
      const nomeArquivo = `${Date.now()}_${novoEdital.arquivo.name}`;
      const storagePath = `editais/${nomeArquivo}`;
      const arquivoRef = ref(storage, storagePath);
      await uploadBytes(arquivoRef, novoEdital.arquivo);
      const urlPDF = await getDownloadURL(arquivoRef);

      await addDoc(collection(db, 'editais'), {
        empresaId: novoEdital.empresaId,
        empresaNome: empresa.name,
        empresaLogo: empresa.logo || '',
        dataPublicacao: novoEdital.dataPublicacao,
        nomeArquivo: novoEdital.arquivo.name,
        urlPDF,
        storagePath,
        criadoEm: new Date()
      });

      setNovoEdital({ titulo: '', empresaId: '', dataPublicacao: '', arquivo: null });
      setModalNovoEdital(false);
      await carregarEditais();
      swalDark.fire({ icon: 'success', title: 'Edital salvo!', timer: 1500, showConfirmButton: false });
    } catch (error) {
      console.error(error);
      swalDark.fire({ icon: 'error', title: 'Erro', text: 'Erro ao salvar edital.' });
    } finally {
      setSalvandoEdital(false);
      setUploadandoEdital(false);
    }
  };

  const removerEdital = async (edital) => {
    const result = await swalDark.fire({
      title: 'Remover edital?',
      text: 'Esta ação não pode ser desfeita!',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#ff4d4d',
      cancelButtonText: 'Cancelar',
      confirmButtonText: 'Sim, remover!'
    });
    if (!result.isConfirmed) return;
    try {
      if (edital.storagePath) {
        await deleteObject(ref(storage, edital.storagePath)).catch(() => {});
      }
      await deleteDoc(doc(db, 'editais', edital.id));
      await carregarEditais();
      setDiaSelecionado(null);
      swalDark.fire({ icon: 'success', title: 'Removido!', timer: 1500, showConfirmButton: false });
    } catch (error) {
      swalDark.fire({ icon: 'error', title: 'Erro', text: 'Erro ao remover edital.' });
    }
  };

  const getDiasDoMes = (mes) => new Date(anoAtual, mes + 1, 0).getDate();
  const getEditaisDoMes = (mes) => editais.filter(e => {
    const d = new Date(e.dataPublicacao + 'T00:00:00');
    return d.getMonth() === mes && d.getFullYear() === anoAtual;
  });
  const getEditaisDoDia = (mes, dia) => editais.filter(e => {
    const d = new Date(e.dataPublicacao + 'T00:00:00');
    return d.getMonth() === mes && d.getDate() === dia && d.getFullYear() === anoAtual;
  });
  const temEditalNoDia = (mes, dia) => getEditaisDoDia(mes, dia).length > 0;

  return (
    <main className="home-content">
      <div className="home-header">
        <h1 className="os-title">Gestão de Unidades</h1>
        <div className="header-actions">
          <button className="btn-editais" onClick={() => { setCalendarioAberto(!calendarioAberto); setMesSelecionado(null); setDiaSelecionado(null); }}>
            📋 Diário Oficial do Estado
          </button>
          <button className="btn-nova-empresa" onClick={() => setModalAberto(true)}>+ Nova Empresa</button>

          {calendarioAberto && (
            <div className="calendario-balao" ref={calendarioRef} onClick={e => e.stopPropagation()}>
              <div className="calendario-header">
                <span>📅 Editais {anoAtual}</span>
                <button className="btn-novo-edital" onClick={() => { setModalNovoEdital(true); }}>+ Novo Edital</button>
              </div>

              {mesSelecionado === null ? (
                <div className="calendario-meses">
                  {MESES.map((nomeMes, idx) => {
                    const qtd = getEditaisDoMes(idx).length;
                    return (
                      <div key={idx} className={`mes-item ${qtd > 0 ? 'mes-com-edital' : ''}`} onClick={() => setMesSelecionado(idx)}>
                        <span className="mes-nome">{nomeMes}</span>
                        {qtd > 0 && <span className="mes-badge">{qtd}</span>}
                      </div>
                    );
                  })}
                </div>
              ) : diaSelecionado === null ? (
                <div>
                  <button className="btn-voltar-cal" onClick={() => setMesSelecionado(null)}>← Voltar</button>
                  <div className="cal-mes-titulo">{MESES[mesSelecionado]}</div>
                  <div className="calendario-dias">
                    {Array.from({ length: getDiasDoMes(mesSelecionado) }, (_, i) => i + 1).map(dia => (
                      <div
                        key={dia}
                        className={`dia-item ${temEditalNoDia(mesSelecionado, dia) ? 'dia-com-edital' : ''}`}
                        onClick={() => temEditalNoDia(mesSelecionado, dia) && setDiaSelecionado(dia)}
                      >
                        {dia}
                        {temEditalNoDia(mesSelecionado, dia) && <span className="dia-ponto"></span>}
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div>
                  <button className="btn-voltar-cal" onClick={() => setDiaSelecionado(null)}>← Voltar</button>
                  <div className="cal-mes-titulo">{diaSelecionado} de {MESES[mesSelecionado]}</div>
                  <div className="editais-lista">
                    {getEditaisDoDia(mesSelecionado, diaSelecionado).map((edital, i) => {
                      return (
                        <div key={i} className="edital-item">
                          <div className="edital-empresa">
                            {edital.empresaLogo
                              ? <img src={edital.empresaLogo} alt="" className="edital-logo" />
                              : <span>🏢</span>
                            }
                            <span className="edital-empresa-nome">{edital.empresaNome}</span>
                          </div>
                          <div className="edital-arquivo">📄 {edital.nomeArquivo}</div>
                          <div style={{display: 'flex', gap: '8px', marginTop: '8px'}}>
                            <a href={edital.urlPDF} target="_blank" rel="noreferrer" className="btn-edital-abrir">ABRIR PDF</a>
                            <button className="btn-edital-remover" onClick={() => removerEdital(edital)}>REMOVER</button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {loading ? (
        <p style={{color: 'rgba(255,255,255,0.5)', textAlign: 'center', marginTop: '60px'}}>Carregando...</p>
      ) : (
        <div className="os-grid">
          {empresas.map((emp) => (
            <div key={emp.id} className="os-card" onClick={() => navigate(`/empresa/${emp.id}`, { state: emp })}>
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
              <input type="text" placeholder="Ex: COOPED" value={novaEmpresa.name} onChange={e => setNovaEmpresa({...novaEmpresa, name: e.target.value})} />
            </div>
            <div className="campo">
              <label>CNPJ</label>
              <input type="text" placeholder="Ex: 01.052.748/0001-09" value={novaEmpresa.cnpj} onChange={e => setNovaEmpresa({...novaEmpresa, cnpj: e.target.value})} />
            </div>
            <div className="campo">
              <label>Logo (imagem)</label>
              <input type="file" accept="image/*" onChange={e => setNovaEmpresa({...novaEmpresa, logo: e.target.files[0]})} />
            </div>
            <button className="btn-salvar" onClick={salvarEmpresa} disabled={salvando}>
              {salvando ? 'Salvando...' : 'Salvar Empresa'}
            </button>
          </div>
        </div>
      )}

      {modalNovoEdital && (
        <div className="modal-overlay" onClick={() => setModalNovoEdital(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <button className="modal-close-x" onClick={() => setModalNovoEdital(false)}>&times;</button>
            <h3 style={{color: '#fff', marginBottom: '24px'}}>Novo Edital</h3>
            <div className="campo">
              <label>Empresa</label>
              <select value={novoEdital.empresaId} onChange={e => setNovoEdital({...novoEdital, empresaId: e.target.value})} className="select-estilo-novo">
                <option value="">Selecione uma empresa</option>
                {empresas.map(emp => <option key={emp.id} value={emp.id}>{emp.name}</option>)}
              </select>
            </div>
            <div className="campo">
              <label>Data de Publicação</label>
              <input type="date" value={novoEdital.dataPublicacao} onChange={e => setNovoEdital({...novoEdital, dataPublicacao: e.target.value})} />
            </div>
            <div className="campo">
              <label>PDF do Edital</label>
              <input type="file" accept=".pdf" onChange={e => setNovoEdital({...novoEdital, arquivo: e.target.files[0]})} />
            </div>
            <button className="btn-salvar" onClick={salvarEdital} disabled={salvandoEdital}>
              {uploadandoEdital ? 'Enviando PDF...' : salvandoEdital ? 'Salvando...' : 'Salvar Edital'}
            </button>
          </div>
        </div>
      )}
    </main>
  );
};

export default Home;