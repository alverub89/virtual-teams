-- ============================================================================
-- SEED DE DEMONSTRACAO COMPLETO — time + squad inteira para rubens (tech lead)
-- Idempotente (guardado por secao) e atomico. Seguro re-rodar.
--
-- Cria o TIME (PM, tech lead, 3 devs, gestor) com senha de demo, para voce
-- LOGAR EM CADA PAPEL e demonstrar todas as visoes. Popula todas as telas da
-- squad: iniciativas+etapas+historias, OKRs+KRs+medicoes, esteira, GMUD, PR,
-- docs, KB e execucao autonoma (com checkpoint humano).
--
-- Senha de todos os usuarios de demo: Demo@2026
-- Emails: ana.souza / bruno.lima / carla.nunes / diego.alves / eduardo.ramos
--         @acme-demo.com   (rubens continua com a sua senha atual)
-- ============================================================================
DO $$
DECLARE
  v_pessoa uuid; v_com uuid; v_squad uuid; v_cap uuid; v_repo uuid;
  v_ini1 uuid; v_ini2 uuid; v_okr uuid; v_kr1 uuid; v_kr2 uuid; v_run uuid;
  v_pm uuid; v_dev1 uuid; v_dev2 uuid; v_dev3 uuid; v_gestor uuid;
  -- hash scrypt de 'Demo@2026' (formato salt:hash do app)
  v_hash text := '8fc582f5193cbb2793988e8cf72b0865:eefb8ad62cace5de38807ea91dc81c9f71e3eac719c76cab06edb365b892ebe76530955054f311fcb2e742965e914b6f4ac6a3402d61a7769afc7c6e71f7c6cf';
BEGIN
  SELECT id, squad_id, comunidade_id INTO v_pessoa, v_squad, v_com
  FROM ai_workspace.pessoa WHERE lower(email) = lower('rubens.de.s.alves@hotmail.com');
  IF v_squad IS NULL THEN RAISE EXCEPTION 'Rubens sem squad_id — rode o seed da squad antes.'; END IF;

  -- ---------- TIME (idempotente por email) ----------
  SELECT id INTO v_pm FROM ai_workspace.pessoa WHERE lower(email)=lower('ana.souza@acme-demo.com');
  IF v_pm IS NULL THEN
    INSERT INTO ai_workspace.pessoa(nome,email,senha_hash,papel,comunidade_id,squad_id,onboarding_concluido)
    VALUES ('Ana Souza','ana.souza@acme-demo.com',v_hash,'pm',v_com,v_squad,true) RETURNING id INTO v_pm;
  END IF;
  SELECT id INTO v_dev1 FROM ai_workspace.pessoa WHERE lower(email)=lower('bruno.lima@acme-demo.com');
  IF v_dev1 IS NULL THEN
    INSERT INTO ai_workspace.pessoa(nome,email,senha_hash,papel,comunidade_id,squad_id,onboarding_concluido)
    VALUES ('Bruno Lima','bruno.lima@acme-demo.com',v_hash,'dev',v_com,v_squad,true) RETURNING id INTO v_dev1;
  END IF;
  SELECT id INTO v_dev2 FROM ai_workspace.pessoa WHERE lower(email)=lower('carla.nunes@acme-demo.com');
  IF v_dev2 IS NULL THEN
    INSERT INTO ai_workspace.pessoa(nome,email,senha_hash,papel,comunidade_id,squad_id,onboarding_concluido)
    VALUES ('Carla Nunes','carla.nunes@acme-demo.com',v_hash,'dev',v_com,v_squad,true) RETURNING id INTO v_dev2;
  END IF;
  SELECT id INTO v_dev3 FROM ai_workspace.pessoa WHERE lower(email)=lower('diego.alves@acme-demo.com');
  IF v_dev3 IS NULL THEN
    INSERT INTO ai_workspace.pessoa(nome,email,senha_hash,papel,comunidade_id,squad_id,onboarding_concluido)
    VALUES ('Diego Alves','diego.alves@acme-demo.com',v_hash,'dev',v_com,v_squad,true) RETURNING id INTO v_dev3;
  END IF;
  SELECT id INTO v_gestor FROM ai_workspace.pessoa WHERE lower(email)=lower('eduardo.ramos@acme-demo.com');
  IF v_gestor IS NULL THEN
    INSERT INTO ai_workspace.pessoa(nome,email,senha_hash,papel,comunidade_id,squad_id,onboarding_concluido)
    VALUES ('Eduardo Ramos','eduardo.ramos@acme-demo.com',v_hash,'gestao',v_com,NULL,true) RETURNING id INTO v_gestor;
  END IF;

  -- ---------- capacidade + repositorio ----------
  SELECT id INTO v_cap FROM ai_workspace.capacidade WHERE squad_id = v_squad LIMIT 1;
  IF v_cap IS NULL THEN
    INSERT INTO ai_workspace.capacidade(squad_id, nome, descricao, sigla)
    VALUES (v_squad, 'PIX Cobranca', 'Cobrancas e recorrencias via PIX', 'PIXCOB') RETURNING id INTO v_cap;
  END IF;
  SELECT id INTO v_repo FROM ai_workspace.repositorio WHERE squad_id = v_squad LIMIT 1;
  IF v_repo IS NULL THEN
    INSERT INTO ai_workspace.repositorio(squad_id, nome) VALUES (v_squad, 'acme/pix-cobranca') RETURNING id INTO v_repo;
  END IF;

  -- ---------- iniciativas + etapas + historias (distribuidas no time) ----------
  IF NOT EXISTS (SELECT 1 FROM ai_workspace.iniciativa WHERE squad_id = v_squad) THEN
    INSERT INTO ai_workspace.iniciativa(codigo, squad_id, capacidade_id, titulo, descricao, status, etapa_atual, criado_por)
    VALUES ('INI-401', v_squad, v_cap, 'PIX Automatico para recorrencias', 'Cobrancas recorrentes via PIX Automatico.', 'em_andamento', 3, v_pm) RETURNING id INTO v_ini1;
    INSERT INTO ai_workspace.iniciativa_etapa(iniciativa_id, ordem, nome, status, artefato, concluida_em) VALUES
      (v_ini1, 1, 'Descoberta', 'concluida', '{"titulo":"Brief","secoes":[{"h":"Problema","itens":["Recorrencias dependem de cartao","Churn por falha de cobranca"]}]}', now()),
      (v_ini1, 2, 'PRD', 'concluida', '{"titulo":"PRD","secoes":[{"h":"Requisitos","itens":["Autorizacao unica","Trilha de auditoria","Notificacao"]}]}', now()),
      (v_ini1, 3, 'Arquitetura', 'em_andamento', NULL, NULL),
      (v_ini1, 4, 'Historias', 'pendente', NULL, NULL),
      (v_ini1, 5, 'Desenvolvimento', 'pendente', NULL, NULL);
    INSERT INTO ai_workspace.historia(iniciativa_id, codigo, titulo, descricao, pontos, status, responsavel_id) VALUES
      (v_ini1, 'PIXCOB-101', 'Autorizacao de recorrencia', 'Consentimento do pagador', 5, 'em_dev', v_dev1),
      (v_ini1, 'PIXCOB-102', 'Motor de agendamento', 'Agenda e dispara cobrancas', 5, 'backlog', v_dev2),
      (v_ini1, 'PIXCOB-103', 'Trilha de auditoria', 'Registra alteracoes', 3, 'review', v_dev3);
    INSERT INTO ai_workspace.mensagem_chat(iniciativa_id, etapa_ordem, autor, autor_nome, conteudo, tokens) VALUES
      (v_ini1, 3, 'user', 'Rubens', 'Podemos reusar o servico de consentimento do Open Finance?', 20),
      (v_ini1, 3, 'agente', 'Agente Arquiteto', 'Sim, proponho um modulo novo com eventos. Registro como ADR?', 120);

    INSERT INTO ai_workspace.iniciativa(codigo, squad_id, capacidade_id, titulo, descricao, status, etapa_atual, criado_por)
    VALUES ('INI-388', v_squad, v_cap, 'Split de pagamento para marketplaces', 'Divisao automatica entre vendedores.', 'concluida', 5, v_pm) RETURNING id INTO v_ini2;
    INSERT INTO ai_workspace.iniciativa_etapa(iniciativa_id, ordem, nome, status, concluida_em) VALUES
      (v_ini2, 1, 'Descoberta', 'concluida', now()), (v_ini2, 2, 'PRD', 'concluida', now()),
      (v_ini2, 3, 'Arquitetura', 'concluida', now()), (v_ini2, 4, 'Historias', 'concluida', now()),
      (v_ini2, 5, 'Desenvolvimento', 'concluida', now());
    INSERT INTO ai_workspace.historia(iniciativa_id, codigo, titulo, pontos, status, responsavel_id) VALUES
      (v_ini2, 'PIXCOB-090', 'Regras de split', 3, 'concluida', v_dev1),
      (v_ini2, 'PIXCOB-091', 'Liquidacao por vendedor', 5, 'concluida', v_dev2);

    INSERT INTO ai_workspace.execucao_esteira(squad_id, iniciativa_id, repositorio, etapa, status, detalhe) VALUES
      (v_squad, v_ini1, 'acme/pix-cobranca', 'build', 'ok', 'build #128 verde'),
      (v_squad, v_ini1, 'acme/pix-cobranca', 'testes', 'ok', 'cobertura 87%'),
      (v_squad, v_ini1, 'acme/pix-cobranca', 'seguranca', 'em_execucao', 'SAST em andamento');
    INSERT INTO ai_workspace.gmud(squad_id, iniciativa_id, numero, titulo, status, risco, janela)
    VALUES (v_squad, v_ini1, 'CHG-2026-0912', 'Deploy PIX Automatico - fase 1', 'aguardando_aprovacao', 'medio', '2026-07-20 02:00 as 04:00');
    INSERT INTO ai_workspace.pull_request(repositorio_id, iniciativa_id, numero, titulo, autor_nome, status) VALUES
      (v_repo, v_ini1, 42, 'feat: consentimento de recorrencia', 'Bruno Lima', 'aberto'),
      (v_repo, v_ini1, 43, 'test: casos de borda do agendador', 'Carla Nunes', 'aprovado');
  END IF;

  -- ---------- OKR + KRs + medicoes + feature ----------
  IF NOT EXISTS (SELECT 1 FROM ai_workspace.okr WHERE squad_id = v_squad) THEN
    SELECT id INTO v_ini1 FROM ai_workspace.iniciativa WHERE squad_id = v_squad AND codigo = 'INI-401' LIMIT 1;
    INSERT INTO ai_workspace.okr(escopo, squad_id, objetivo, dono, trimestre)
    VALUES ('squad', v_squad, 'Elevar a adesao ao PIX Automatico', 'Ana Souza', '2026-Q3') RETURNING id INTO v_okr;
    INSERT INTO ai_workspace.key_result(okr_id, ordem, descricao, unidade, baseline, meta, invertido)
    VALUES (v_okr, 1, 'Percentual de recorrencias migradas para PIX Automatico', '%', 5, 40, false) RETURNING id INTO v_kr1;
    INSERT INTO ai_workspace.key_result(okr_id, ordem, descricao, unidade, baseline, meta, invertido)
    VALUES (v_okr, 2, 'Custo medio por transacao (centavos)', 'numero', 12, 7, true) RETURNING id INTO v_kr2;
    INSERT INTO ai_workspace.kr_medicao(kr_id, mes, planejado, realizado) VALUES
      (v_kr1, '2026-07', 12, 10), (v_kr1, '2026-08', 22, NULL), (v_kr1, '2026-09', 40, NULL),
      (v_kr2, '2026-07', 11, 11), (v_kr2, '2026-08', 9, NULL), (v_kr2, '2026-09', 7, NULL);
    IF v_ini1 IS NOT NULL THEN
      INSERT INTO ai_workspace.kr_feature(kr_id, iniciativa_id) VALUES (v_kr1, v_ini1);
    END IF;
  END IF;

  -- ---------- Execucao autonoma (run + passos + checkpoint humano) ----------
  IF NOT EXISTS (SELECT 1 FROM ai_workspace.execucao_autonoma WHERE squad_id = v_squad) THEN
    SELECT k.id INTO v_kr1 FROM ai_workspace.key_result k
      JOIN ai_workspace.okr o ON o.id = k.okr_id WHERE o.squad_id = v_squad ORDER BY k.ordem LIMIT 1;
    INSERT INTO ai_workspace.execucao_autonoma(squad_id, kr_id, objetivo, status, passo_atual, tokens_gastos, teto_tokens, criado_por)
    VALUES (v_squad, v_kr1, 'Migrar recorrencias piloto para PIX Automatico', 'aguardando_aprovacao', 3, 45000, 200000, v_pessoa)
    RETURNING id INTO v_run;
    INSERT INTO ai_workspace.execucao_passo(execucao_id, ordem, nome, agente_nome, tipo, status, saida, concluido_em) VALUES
      (v_run, 1, 'Planejamento da migracao', 'Agente PM', 'automatica', 'concluido', '{"resumo":"Plano em 3 ondas por porte de cliente","itens":["Onda 1: MEIs","Onda 2: PMEs","Onda 3: grandes contas"]}', now()),
      (v_run, 2, 'Analise de impacto tecnico', 'Agente Arquiteto', 'automatica', 'concluido', '{"resumo":"Impacto baixo; reuso do servico de consentimento","itens":["Sem breaking change","Rollback por feature flag"]}', now()),
      (v_run, 3, 'Aprovar plano de migracao', NULL, 'checkpoint', 'aguardando', NULL, NULL),
      (v_run, 4, 'Executar migracao piloto', 'Agente Dev', 'automatica', 'pendente', NULL, NULL);
    INSERT INTO ai_workspace.execucao_checkpoint(execucao_id, passo_ordem, titulo, resumo, status)
    VALUES (v_run, 3, 'Aprovar plano de migracao', 'Revisar as 3 ondas antes de executar o piloto com MEIs.', 'aberto');
  END IF;

  -- ---------- Documentos + KB ----------
  IF NOT EXISTS (SELECT 1 FROM ai_workspace.documento WHERE squad_id = v_squad) THEN
    SELECT id INTO v_ini1 FROM ai_workspace.iniciativa WHERE squad_id = v_squad AND codigo = 'INI-401' LIMIT 1;
    INSERT INTO ai_workspace.documento(squad_id, iniciativa_id, titulo, tipo, resumo, conteudo, autor_nome, escopo) VALUES
      (v_squad, v_ini1, 'PRD - PIX Automatico', 'prd', 'Requisitos do PIX Automatico', E'# PRD\n\nRequisitos e criterios de aceite.', 'Ana Souza', 'squad'),
      (v_squad, v_ini1, 'ADR - Reuso do servico de consentimento', 'adr', 'Decisao de arquitetura', E'# ADR\n\nReusar o servico existente com modulo novo.', 'Rubens', 'squad'),
      (v_squad, NULL,   'Guia de operacao da esteira', 'guia', 'Como acompanhar build/testes/GMUD', E'# Esteira\n\nPasso a passo dos gates ate a GMUD.', 'Rubens', 'squad');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM ai_workspace.kb_artigo WHERE squad_id = v_squad) THEN
    INSERT INTO ai_workspace.kb_artigo(escopo, squad_id, titulo, resumo, conteudo, autor_id, autor_nome) VALUES
      ('squad', v_squad, 'Padrao de idempotencia em cobrancas', 'Idempotencia ponta a ponta', E'# Idempotencia\n\nUse chave de idempotencia por operacao...', v_pessoa, 'Rubens'),
      ('squad', v_squad, 'Checklist de PII para GMUD', 'O que revisar antes de subir', E'# PII\n\nMascaramento, base legal e retencao...', v_pm, 'Ana Souza');
  END IF;

  -- ---------- Consumo de tokens do mes (para indicadores) ----------
  INSERT INTO ai_workspace.consumo_tokens(squad_id, mes, prompt_tokens, completion_tokens, custo)
  VALUES (v_squad, '2026-07', 1250000, 480000, 92.0)
  ON CONFLICT (squad_id, mes) DO NOTHING;
END $$;

-- Verificacao (deve voltar contagens > 0 em tudo):
SELECT
  (SELECT count(*) FROM ai_workspace.pessoa p WHERE p.squad_id=sq.id) AS membros_squad,
  (SELECT count(*) FROM ai_workspace.iniciativa i WHERE i.squad_id=sq.id) AS iniciativas,
  (SELECT count(*) FROM ai_workspace.historia h JOIN ai_workspace.iniciativa i ON i.id=h.iniciativa_id WHERE i.squad_id=sq.id) AS historias,
  (SELECT count(*) FROM ai_workspace.okr o WHERE o.squad_id=sq.id) AS okrs,
  (SELECT count(*) FROM ai_workspace.execucao_autonoma e WHERE e.squad_id=sq.id) AS runs,
  (SELECT count(*) FROM ai_workspace.documento d WHERE d.squad_id=sq.id) AS docs,
  (SELECT count(*) FROM ai_workspace.kb_artigo k WHERE k.squad_id=sq.id) AS kb
FROM ai_workspace.squad sq
JOIN ai_workspace.pessoa me ON me.squad_id = sq.id
WHERE lower(me.email)=lower('rubens.de.s.alves@hotmail.com')
LIMIT 1;
