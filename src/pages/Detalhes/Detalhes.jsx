import React, { useState, useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { collection, getDocs, addDoc, doc, updateDoc, deleteDoc, arrayUnion, arrayRemove } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import emailjs from '@emailjs/browser';
import Swal from 'sweetalert2';
import { db, storage } from '../../services/firebase';
import './Detalhes.css';

const CATEGORIAS = [
  "1. Habilitação Jurídica",
  "2. Regularidade Fiscal, Social e Trabalhista",
  "3. Qualificação Técnica",
  "4. Qualificação Econômica Financeira",
  "5. Documentação Complementar"
];

const EMAILJS_SERVICE_ID = "service_jtup5ga";
const EMAILJS_TEMPLATE_ID = "template_fovrceq";
const EMAILJS_PUBLIC_KEY = "GgEq-HxrTW_0IZh1s";

const swalDark = Swal.mixin({
  background: '#1e293b',
  color: '#fff',
  confirmButtonColor: '#3b82f6',
  cancelButtonColor: 'rgba(255, 77, 77, 0.2)',
  customClass: {
    cancelButton: 'swal-cancel-btn'
  }
});

const formatarDataBR = (dataStr) => {
  if (!dataStr) return "-";
  if (dataStr.includes('/')) return dataStr;
  const [ano, mes, dia] = dataStr.split('-');
  return `${dia}/${mes}/${ano}`;
};

const calcularStatus = (v_date) => {
  if (!v_date) return 'habilitado';
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const vencimento = new Date(v_date);
  vencimento.setHours(0, 0, 0, 0);
  
  const diffDias = Math.ceil((vencimento - hoje) / (1000 * 60 * 60 * 24));

  if (diffDias < 0) return 'vencido'; // Já passou da data
  if (diffDias <= 3) return 'proximo'; // Faltam 3 dias ou menos
  return 'habilitado';
};

const Detalhes = () => {
  const { state: empresa } = useLocation();
  const navigate = useNavigate();
  const [documentos, setDocumentos] = useState([]);
  const [menuAberto, setMenuAberto] = useState(null);
  const [modalPDFAberto, setModalPDFAberto] = useState(false);
  const [modalNovoDoc, setModalNovoDoc] = useState(false);
  const [docAtivo, setDocAtivo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [uploadando, setUploadando] = useState(false);
  const [novoDoc, setNovoDoc] = useState({
    categoria: CATEGORIAS[0],
    nome: '',
    v_date: ''
  });
  const emailEnviadoRef = useRef(false);

  useEffect(() => {
    if (empresa) carregarDocumentos();
  }, [empresa]);

  const carregarDocumentos = async () => {
    try {
      const snapshot = await getDocs(collection(db, 'empresas', empresa.id, 'documentos'));
      const lista = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      setDocumentos(lista);
      verificarEEnviarEmail(lista);
    } catch (error) {
      console.error('Erro ao carregar documentos:', error);
    } finally {
      setLoading(false);
    }
  };

  const verificarEEnviarEmail = (lista) => {
    if (emailEnviadoRef.current) return;

    const criticos = lista.filter(d => {
      const status = calcularStatus(d.v_date);
      return status === 'proximo' || status === 'vencido';
    });

    if (criticos.length === 0) return;

    const textoDocumentos = criticos.map(d => {
      const status = calcularStatus(d.v_date);
      const emoji = status === 'vencido' ? '🔴' : '🟡';
      return `${emoji} ${d.nome} - Vencimento: ${formatarDataBR(d.v_date)} - Status: ${status === 'vencido' ? 'VENCIDO' : 'PRÓXIMO DO VENCIMENTO'}`;
    }).join('\n');

    emailjs.send(
      EMAILJS_SERVICE_ID,
      EMAILJS_TEMPLATE_ID,
      {
        empresa: empresa.name,
        documentos: textoDocumentos,
        name: 'Sistema de Gestão TechOS',
        email: 'sistema@gestao.com'
      },
      EMAILJS_PUBLIC_KEY
    ).then(() => {
      emailEnviadoRef.current = true;
    }).catch((error) => {
      console.error('Erro ao enviar email:', error);
    });
  };

  const salvarDocumento = async () => {
    if (!novoDoc.nome || !novoDoc.v_date) {
      return swalDark.fire({ icon: 'warning', title: 'Atenção', text: 'Preencha todos os campos!' });
    }
    setSalvando(true);
    try {
      const hoje = new Date();
      const i_date = `${String(hoje.getDate()).padStart(2,'0')}/${String(hoje.getMonth()+1).padStart(2,'0')}/${hoje.getFullYear()}`;
      await addDoc(collection(db, 'empresas', empresa.id, 'documentos'), {
        ...novoDoc,
        i_date,
        status: calcularStatus(novoDoc.v_date),
        arquivos: [],
        criadoEm: new Date()
      });
      setNovoDoc({ categoria: CATEGORIAS[0], nome: '', v_date: '' });
      setModalNovoDoc(false);
      await carregarDocumentos();
      swalDark.fire({ icon: 'success', title: 'Sucesso!', text: 'Documento criado.', timer: 1500, showConfirmButton: false });
    } catch (error) {
      swalDark.fire({ icon: 'error', title: 'Erro', text: 'Erro ao salvar documento!' });
    } finally {
      setSalvando(false);
    }
  };

  const uploadPDF = async (arquivo, docId) => {
    setUploadando(true);
    try {
      const nomeArquivoUnico = `${Date.now()}_${arquivo.name}`;
      const caminhoStorage = `empresas/${empresa.id}/documentos/${nomeArquivoUnico}`;
      const arquivoRef = ref(storage, caminhoStorage);

      await uploadBytes(arquivoRef, arquivo);
      const urlFinal = await getDownloadURL(arquivoRef);

      const docRef = doc(db, 'empresas', empresa.id, 'documentos', docId);
      const novoArquivoObj = { nome: arquivo.name, url: urlFinal, path: caminhoStorage };
      
      await updateDoc(docRef, { arquivos: arrayUnion(novoArquivoObj) });
      await carregarDocumentos();
      setDocAtivo(prev => prev?.id === docId ? { ...prev, arquivos: [...(prev?.arquivos || []), novoArquivoObj] } : prev);
      
      swalDark.fire({ icon: 'success', title: 'Enviado!', text: 'PDF salvo com sucesso.', timer: 1500, showConfirmButton: false });
    } catch (error) {
      swalDark.fire({ icon: 'error', title: 'Erro', text: 'Erro ao fazer upload do PDF.' });
    } finally {
      setUploadando(false);
    }
  };

  const removerPDF = async (arquivoParaRemover) => {
    const result = await swalDark.fire({
      title: 'Remover este PDF?',
      text: "Esta ação não pode ser desfeita!",
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#ff4d4d',
      cancelButtonText: '<span style="color: #ff4d4d">Cancelar</span>',
      confirmButtonText: 'Sim, remover!'
    });

    if (!result.isConfirmed) return;

    try {
      if (arquivoParaRemover.path) {
        await deleteObject(ref(storage, arquivoParaRemover.path)).catch(() => {});
      }
      const docRef = doc(db, 'empresas', empresa.id, 'documentos', docAtivo.id);
      await updateDoc(docRef, { arquivos: arrayRemove(arquivoParaRemover) });
      setDocAtivo(prev => ({ ...prev, arquivos: prev.arquivos.filter(arq => arq.url !== arquivoParaRemover.url) }));
      await carregarDocumentos();
      swalDark.fire({ icon: 'success', title: 'Removido!', text: 'O arquivo foi apagado.', timer: 1500, showConfirmButton: false });
    } catch (error) {
      swalDark.fire({ icon: 'error', title: 'Erro', text: 'Erro ao remover o arquivo.' });
    }
  };

  const deletarDocumentoInteiro = async (documento) => {
    const result = await swalDark.fire({
      title: 'Excluir Item?',
      text: `Deseja excluir permanentemente "${documento.nome}" e todos os PDFs?`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#ff4d4d',
      cancelButtonText: '<span style="color: #ff4d4d">Cancelar</span>',
      confirmButtonText: 'Sim, excluir!'
    });

    if (!result.isConfirmed) return;

    try {
      if (documento.arquivos && documento.arquivos.length > 0) {
        const promessas = documento.arquivos.map(arq => {
          if (arq.path) {
            const fileRef = ref(storage, arq.path);
            return deleteObject(fileRef).catch(() => {});
          }
          return Promise.resolve();
        });
        await Promise.all(promessas);
      }
      await deleteDoc(doc(db, 'empresas', empresa.id, 'documentos', documento.id));
      setMenuAberto(null);
      await carregarDocumentos();
      swalDark.fire({ icon: 'success', title: 'Excluído!', text: 'O item foi removido.', timer: 1500, showConfirmButton: false });
    } catch (error) {
      swalDark.fire({ icon: 'error', title: 'Erro', text: 'Erro ao excluir o documento.' });
    }
  };

  const documentosPorCategoria = (categoria) => documentos.filter(d => d.categoria === categoria);

  if (!empresa) return <div className="app-container">Selecione uma empresa na Home.</div>;

  return (
    <main className="detalhes-container" onClick={() => setMenuAberto(null)}>
      <header className="detalhes-header">
        <div className="header-left">
          <div className="header-logo-container">
            {empresa.logo ? <img src={empresa.logo} alt="" className="header-logo-img" /> : <span style={{fontSize: '2rem'}}>🏢</span>}
          </div>
          <div>
            <h1 className="os-title">{empresa.name}</h1>
            <div className="detalhes-cnpj-container">
              <span className="cnpj-label">CNPJ</span>
              <span className="cnpj-value">{empresa.cnpj}</span>
            </div>
          </div>
        </div>
        <div style={{display: 'flex', gap: '12px'}}>
          <button className="btn-novo-doc" onClick={() => setModalNovoDoc(true)}>+ Novo Documento</button>
          <button onClick={() => navigate('/')} className="btn-voltar">← Voltar</button>
        </div>
      </header>

      {loading ? (
        <p style={{color: 'rgba(255,255,255,0.5)', textAlign: 'center', marginTop: '60px'}}>Carregando...</p>
      ) : (
        CATEGORIAS.map((cat, idx) => (
          <section key={idx} className="categoria-box">
            <h2 style={{color: '#3b82f6', marginBottom: '20px', borderLeft: '4px solid #3b82f6', paddingLeft: '15px', fontSize: '1.2rem'}}>{cat}</h2>
            {documentosPorCategoria(cat).length === 0 ? (
              <p style={{opacity: 0.3, fontSize: '0.85rem', paddingLeft: '20px'}}>Nenhum documento cadastrado.</p>
            ) : (
              <>
                <div className="doc-header-labels">
                  <div>DOCUMENTO</div>
                  <div>VENCIMENTO</div>
                  <div>INSERÇÃO</div>
                  <div>STATUS</div>
                  <div>AÇÕES</div>
                </div>
                <div className="docs-lista">
                  {documentosPorCategoria(cat).map((documento) => {
                    const status = calcularStatus(documento.v_date);
                    return (
                      <div key={documento.id} className="doc-item">
                        <div className="doc-nome">{documento.nome}</div>
                        <div className="valor-data">{formatarDataBR(documento.v_date)}</div>
                        <div className="valor-data">{documento.i_date}</div>
                        <div className="status-col">
                          <span className={`status-badge ${status}`}>
                            {status === 'proximo' ? 'PRÓX. VENC.' : status.toUpperCase()}
                          </span>
                        </div>
                        <div className="doc-acoes-wrapper" onClick={(e) => e.stopPropagation()}>
                          <button className="btn-acoes" onClick={() => setMenuAberto(menuAberto === documento.id ? null : documento.id)}>
                            Gerenciar ▼
                          </button>
                          {menuAberto === documento.id && (
                            <div className="menu-dropdown">
                              <label className="menu-item">
                                ➕ Adicionar PDF
                                <input type="file" accept=".pdf" style={{display:'none'}} onChange={(e) => e.target.files[0] && uploadPDF(e.target.files[0], documento.id)} />
                              </label>
                              <button className="menu-item" onClick={() => { setDocAtivo(documento); setModalPDFAberto(true); setMenuAberto(null); }}>
                                👁️ Ver PDFs
                              </button>
                              <button className="menu-item" style={{color: '#ff4d4d', borderTop: '1px solid rgba(255,255,255,0.05)', marginTop: '5px'}} onClick={() => deletarDocumentoInteiro(documento)}>
                                🗑️ Excluir Item
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </section>
        ))
      )}

      {uploadando && (
        <div className="modal-overlay">
          <div style={{color: '#fff', fontSize: '1.2rem', textAlign: 'center'}}>
            <div style={{fontSize: '3rem', marginBottom: '16px'}}>📤</div>
            Enviando PDF...
          </div>
        </div>
      )}

      {modalNovoDoc && (
        <div className="modal-overlay" onClick={() => setModalNovoDoc(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <button className="modal-close-x" onClick={() => setModalNovoDoc(false)}>&times;</button>
            <h3 style={{color: '#fff', marginBottom: '24px'}}>Novo Documento</h3>
            <div className="campo">
              <label>Categoria</label>
              <select value={novoDoc.categoria} onChange={e => setNovoDoc({...novoDoc, categoria: e.target.value})}>
                {CATEGORIAS.map((cat, i) => <option key={i} value={cat}>{cat}</option>)}
              </select>
            </div>
            <div className="campo">
              <label>Nome do Documento</label>
              <input type="text" placeholder="Ex: Ata de Fundação" value={novoDoc.nome} onChange={e => setNovoDoc({...novoDoc, nome: e.target.value})} />
            </div>
            <div className="campo">
              <label>Data de Vencimento</label>
              <input type="date" value={novoDoc.v_date} onChange={e => setNovoDoc({...novoDoc, v_date: e.target.value})} />
            </div>
            <button className="btn-salvar" onClick={salvarDocumento} disabled={salvando}>{salvando ? 'Salvando...' : 'Salvar Documento'}</button>
          </div>
        </div>
      )}

      {modalPDFAberto && (
        <div className="modal-overlay" onClick={() => setModalPDFAberto(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close-x" onClick={() => setModalPDFAberto(false)}>&times;</button>
            <h3 style={{marginBottom: '20px', color: '#fff'}}>{docAtivo?.nome}</h3>
            {docAtivo?.arquivos?.length > 0 ? docAtivo.arquivos.map((arq, i) => (
              <div key={i} className="arquivo-linha">
                <span style={{fontSize: '0.85rem', color: '#fff'}}>📄 {arq.nome}</span>
                <div style={{display: 'flex', gap: '10px'}}>
                  <a href={arq.url} target="_blank" rel="noopener noreferrer" className="btn-remover-file" style={{color: '#3b82f6', border: '1px solid #3b82f6', background: 'transparent', textDecoration: 'none', padding: '4px 8px'}}>ABRIR</a>
                  <button className="btn-remover-file" onClick={() => removerPDF(arq)}>REMOVER</button>
                </div>
              </div>
            )) : <p style={{opacity: 0.5, padding: '20px 0', textAlign: 'center', color: '#fff'}}>Nenhum arquivo encontrado.</p>}
          </div>
        </div>
      )}
    </main>
  );
};

export default Detalhes;