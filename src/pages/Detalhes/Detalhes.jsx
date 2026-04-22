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
  if (diffDias < 0) return 'vencido';
  if (diffDias <= 3) return 'proximo';
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
  const [novoDoc, setNovoDoc] = useState({ categoria: CATEGORIAS[0], nome: '' });
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
    emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, {
      empresa: empresa.name,
      documentos: textoDocumentos,
      name: 'Sistema de Gestão TechOS',
      email: 'sistema@gestao.com'
    }, EMAILJS_PUBLIC_KEY).then(() => {
      emailEnviadoRef.current = true;
    }).catch(console.error);
  };

  const salvarDocumento = async () => {
    if (!novoDoc.nome) {
      return swalDark.fire({ icon: 'warning', title: 'Atenção', text: 'Preencha o nome do documento!' });
    }
    setSalvando(true);
    try {
      const hoje = new Date();
      const i_date = `${String(hoje.getDate()).padStart(2,'0')}/${String(hoje.getMonth()+1).padStart(2,'0')}/${hoje.getFullYear()}`;
      await addDoc(collection(db, 'empresas', empresa.id, 'documentos'), {
        ...novoDoc,
        i_date,
        v_date: '',
        status: 'habilitado',
        arquivos: [],
        criadoEm: new Date()
      });
      setNovoDoc({ categoria: CATEGORIAS[0], nome: '' });
      setModalNovoDoc(false);
      await carregarDocumentos();
      swalDark.fire({ icon: 'success', title: 'Sucesso!', text: 'Documento criado.', timer: 1500, showConfirmButton: false });
    } catch (error) {
      swalDark.fire({ icon: 'error', title: 'Erro', text: 'Erro ao salvar documento!' });
    } finally {
      setSalvando(false);
    }
  };

  const editarVencimento = async (documento) => {
    const { value: resultado } = await swalDark.fire({
      title: 'Editar Vencimento',
      html: `
        <style>
          .swal-venc-wrapper { display: flex; flex-direction: column; gap: 12px; margin-top: 4px; }
          .swal-venc-label { font-size: 0.72rem; font-weight: 700; color: rgba(255,255,255,0.4); text-transform: uppercase; text-align: left; margin-bottom: 4px; letter-spacing: 0.05em; }
          #swal-date-wrapper { transition: opacity 0.2s; }
          #swal-date-wrapper.disabled { opacity: 0.3; pointer-events: none; }
          .swal-venc-toggle { display: flex; align-items: center; gap: 10px; background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08); border-radius: 10px; padding: 12px 14px; cursor: pointer; transition: background 0.2s; }
          .swal-venc-toggle:hover { background: rgba(255,255,255,0.08); }
          .swal-venc-toggle input[type=checkbox] { width: 16px; height: 16px; accent-color: #3b82f6; cursor: pointer; }
          .swal-venc-toggle span { font-size: 0.85rem; color: rgba(255,255,255,0.7); }
        </style>
        <div class="swal-venc-wrapper">
          <div id="swal-date-wrapper" class="${!documento.v_date ? 'disabled' : ''}">
            <p class="swal-venc-label">Data de Vencimento</p>
            <input type="date" id="swal-input-date" class="swal2-input" value="${documento.v_date || ''}" style="margin:0;">
          </div>
          <label class="swal-venc-toggle">
            <input type="checkbox" id="swal-sem-venc" ${!documento.v_date ? 'checked' : ''}>
            <span>Documento sem vencimento</span>
          </label>
        </div>
        <script>
          setTimeout(() => {
            const cb = document.getElementById('swal-sem-venc');
            const dw = document.getElementById('swal-date-wrapper');
            cb.addEventListener('change', () => {
              dw.classList.toggle('disabled', cb.checked);
              if (cb.checked) document.getElementById('swal-input-date').value = '';
            });
          }, 0);
        </script>
      `,
      focusConfirm: false,
      showCancelButton: true,
      confirmButtonText: 'Salvar',
      cancelButtonText: 'Cancelar',
      preConfirm: () => {
        const semVenc = document.getElementById('swal-sem-venc').checked;
        const data = document.getElementById('swal-input-date').value;
        if (!semVenc && !data) {
          Swal.showValidationMessage('Informe uma data ou marque "Sem vencimento".');
          return false;
        }
        return semVenc ? '' : data;
      }
    });

    if (resultado !== undefined) {
      try {
        const docRef = doc(db, 'empresas', empresa.id, 'documentos', documento.id);
        await updateDoc(docRef, { v_date: resultado, status: calcularStatus(resultado) });
        setDocAtivo(prev => prev ? { ...prev, v_date: resultado } : prev);
        await carregarDocumentos();
        swalDark.fire({ icon: 'success', title: 'Atualizado!', timer: 1500, showConfirmButton: false });
      } catch (error) {
        swalDark.fire({ icon: 'error', title: 'Erro', text: 'Erro ao atualizar data.' });
      }
    }
  };

  const adicionarPDFComData = async (documento) => {
    const { value: formValues } = await swalDark.fire({
      title: 'Adicionar PDF',
      width: 480,
      html: `
        <style>
          .spf-form { display:flex; flex-direction:column; gap:16px; margin-top:6px; }
          .spf-label { font-size:0.72rem; font-weight:700; color:rgba(255,255,255,0.4); text-transform:uppercase; text-align:left; letter-spacing:0.05em; margin-bottom:5px; display:block; }
          .spf-drop {
            border: 2px dashed rgba(59,130,246,0.35);
            border-radius: 12px;
            padding: 26px 16px;
            text-align: center;
            cursor: pointer;
            background: rgba(59,130,246,0.04);
            position: relative;
            transition: all 0.2s;
          }
          .spf-drop:hover, .spf-drop.over { border-color: #3b82f6; background: rgba(59,130,246,0.1); }
          .spf-drop input[type=file] { position:absolute; inset:0; opacity:0; cursor:pointer; width:100%; height:100%; }
          .spf-drop-icon { font-size:1.8rem; margin-bottom:6px; }
          .spf-drop-hint { font-size:0.82rem; color:rgba(255,255,255,0.45); }
          .spf-drop-hint strong { color:#3b82f6; }
          .spf-fname { font-size:0.78rem; color:#10b981; margin-top:7px; font-weight:700; display:none; }
          .spf-date { background:rgba(255,255,255,0.05)!important; border:1px solid rgba(255,255,255,0.1)!important; border-radius:10px!important; padding:10px 14px!important; color:white!important; font-size:0.9rem!important; width:100%!important; box-sizing:border-box!important; outline:none!important; margin:0!important; }
          .spf-date:focus { border-color:#3b82f6!important; }
          .spf-date:disabled { opacity:0.3!important; cursor:not-allowed!important; }
          .spf-toggle { display:flex; align-items:center; gap:10px; background:rgba(255,255,255,0.04); border:1px solid rgba(255,255,255,0.08); border-radius:10px; padding:11px 14px; cursor:pointer; margin-top:6px; transition:background 0.2s; }
          .spf-toggle:hover { background:rgba(255,255,255,0.08); }
          .spf-toggle input[type=checkbox] { width:15px; height:15px; accent-color:#3b82f6; cursor:pointer; }
          .spf-toggle span { font-size:0.82rem; color:rgba(255,255,255,0.65); }
        </style>
        <div class="spf-form">
          <div>
            <span class="spf-label">Arquivo PDF</span>
            <div class="spf-drop" id="spf-drop">
              <input type="file" accept=".pdf" id="spf-file">
              <div class="spf-drop-icon">📄</div>
              <div class="spf-drop-hint">Arraste aqui ou <strong>clique para selecionar</strong></div>
              <div class="spf-fname" id="spf-fname"></div>
            </div>
          </div>
          <div>
            <span class="spf-label">Data de Vencimento</span>
            <input type="date" id="spf-vdate" class="spf-date">
            <label class="spf-toggle">
              <input type="checkbox" id="spf-semvenc">
              <span>Documento sem vencimento</span>
            </label>
          </div>
        </div>
        <script>
          setTimeout(() => {
            const fi = document.getElementById('spf-file');
            const fn = document.getElementById('spf-fname');
            const drop = document.getElementById('spf-drop');
            const cb = document.getElementById('spf-semvenc');
            const di = document.getElementById('spf-vdate');

            fi.addEventListener('change', () => {
              if (fi.files[0]) { fn.textContent = '✓ ' + fi.files[0].name; fn.style.display = 'block'; }
            });
            drop.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('over'); });
            drop.addEventListener('dragleave', () => drop.classList.remove('over'));
            drop.addEventListener('drop', e => {
              e.preventDefault(); drop.classList.remove('over');
              const f = e.dataTransfer.files[0];
              if (f && f.type === 'application/pdf') {
                const dt = new DataTransfer(); dt.items.add(f); fi.files = dt.files;
                fn.textContent = '✓ ' + f.name; fn.style.display = 'block';
              }
            });
            cb.addEventListener('change', () => { di.disabled = cb.checked; if (cb.checked) di.value = ''; });
          }, 0);
        </script>
      `,
      focusConfirm: false,
      showCancelButton: true,
      confirmButtonText: 'Enviar PDF',
      cancelButtonText: 'Cancelar',
      preConfirm: () => {
        const file = document.getElementById('spf-file').files[0];
        const vdate = document.getElementById('spf-vdate').value;
        const semVenc = document.getElementById('spf-semvenc').checked;
        if (!file) { Swal.showValidationMessage('Selecione um arquivo PDF.'); return false; }
        if (!semVenc && !vdate) { Swal.showValidationMessage('Informe a data de vencimento ou marque "Sem vencimento".'); return false; }
        return { file, vdate: semVenc ? '' : vdate };
      }
    });

    if (!formValues) return;
    const { file, vdate } = formValues;
    setUploadando(true);
    try {
      const nomeArquivoUnico = `${Date.now()}_${file.name}`;
      const caminhoStorage = `empresas/${empresa.id}/documentos/${nomeArquivoUnico}`;
      const arquivoRef = ref(storage, caminhoStorage);
      await uploadBytes(arquivoRef, file);
      const urlFinal = await getDownloadURL(arquivoRef);
      const hoje = new Date();
      const novaDataInsercao = `${String(hoje.getDate()).padStart(2,'0')}/${String(hoje.getMonth()+1).padStart(2,'0')}/${hoje.getFullYear()}`;
      const docRef = doc(db, 'empresas', empresa.id, 'documentos', documento.id);
      await updateDoc(docRef, {
        arquivos: arrayUnion({ nome: file.name, url: urlFinal, path: caminhoStorage }),
        i_date: novaDataInsercao,
        v_date: vdate,
        status: calcularStatus(vdate)
      });
      await carregarDocumentos();
      swalDark.fire({ icon: 'success', title: 'Enviado!', text: 'PDF adicionado com sucesso.', timer: 1500, showConfirmButton: false });
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
        await Promise.all(documento.arquivos.map(arq => arq.path ? deleteObject(ref(storage, arq.path)).catch(() => {}) : Promise.resolve()));
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
                              <button className="menu-item" onClick={() => { adicionarPDFComData(documento); setMenuAberto(null); }}>
                                ➕ Adicionar PDF
                              </button>
                              <button className="menu-item" onClick={() => { setDocAtivo(documento); setModalPDFAberto(true); setMenuAberto(null); }}>
                                📄 Ver Arquivos
                              </button>
                              <button
                                className="menu-item"
                                style={{color: '#ff4d4d', borderTop: '1px solid rgba(255,255,255,0.05)', marginTop: '5px'}}
                                onClick={() => deletarDocumentoInteiro(documento)}
                              >
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
            <button className="btn-salvar" onClick={salvarDocumento} disabled={salvando}>{salvando ? 'Salvando...' : 'Salvar Documento'}</button>
          </div>
        </div>
      )}

      {modalPDFAberto && (
        <div className="modal-overlay" onClick={() => setModalPDFAberto(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close-x" onClick={() => setModalPDFAberto(false)}>&times;</button>
            <h3 style={{marginBottom: '6px', color: '#fff'}}>{docAtivo?.nome}</h3>
            <div style={{display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '20px'}}>
              <span style={{fontSize: '0.8rem', color: 'rgba(255,255,255,0.35)'}}>
                Vencimento: <span style={{color: 'rgba(255,255,255,0.6)'}}>{formatarDataBR(docAtivo?.v_date)}</span>
              </span>
              <button
                onClick={() => editarVencimento(docAtivo)}
                style={{background: 'rgba(59,130,246,0.1)', border: '1px solid rgba(59,130,246,0.3)', color: '#3b82f6', cursor: 'pointer', fontSize: '0.72rem', fontWeight: 700, padding: '3px 10px', borderRadius: '6px'}}
              >
                ✏️ Editar
              </button>
            </div>
            {docAtivo?.arquivos?.length > 0 ? docAtivo.arquivos.map((arq, i) => (
              <div key={i} className="arquivo-linha">
                <span style={{fontSize: '0.85rem', color: '#fff'}}>📄 {arq.nome}</span>
                <div style={{display: 'flex', gap: '10px'}}>
                  <a href={arq.url} target="_blank" rel="noopener noreferrer" className="btn-remover-file" style={{color: '#3b82f6', border: '1px solid #3b82f6', background: 'transparent', textDecoration: 'none', padding: '4px 8px'}}>ABRIR</a>
                  <button className="btn-remover-file" onClick={() => removerPDF(arq)}>REMOVER</button>
                </div>
              </div>
            )) : <p style={{opacity: 0.5, padding: '10px 0 20px', textAlign: 'center', color: '#fff'}}>Nenhum arquivo encontrado.</p>}
          </div>
        </div>
      )}
    </main>
  );
};

export default Detalhes;