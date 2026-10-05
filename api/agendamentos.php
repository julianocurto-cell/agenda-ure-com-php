<?php
require_once __DIR__ . '/config.php';

$user   = exigirLogin();
$pdo    = getPDO();
$method = $_SERVER['REQUEST_METHOD'];
$action = $_GET['action'] ?? 'listar';

const STATUS_VALIDOS = ['planejado', 'concluido'];

/** "1,2,3" -> [1,2,3] (descarta lixo e zeros) */
function listaInteiros(string $csv): array {
    return array_values(array_filter(array_map('intval', explode(',', $csv))));
}

/**
 * Valida e normaliza o corpo de criar/editar.
 * Responde 400 e encerra se algo estiver errado.
 */
function lerPayloadAgendamento(array $in): array {
    $local_id  = (int)($in['local_id'] ?? 0);
    $tarefa_id = (int)($in['tarefa_id'] ?? 0);
    $data      = $in['data'] ?? null;
    $objetivo  = trim((string)($in['objetivo'] ?? ''));
    $resumo    = trim((string)($in['resumo'] ?? ''));
    $status    = $in['status'] ?? 'planejado';
    $periodos  = normalizarPeriodos($in['periodo'] ?? []);

    if (!$local_id || !$tarefa_id) {
        erroJson('Selecione o local e a tarefa.');
    }
    if (!dataValida($data)) {
        erroJson('Informe uma data válida (AAAA-MM-DD).');
    }
    if (count($periodos) === 0) {
        erroJson('Selecione ao menos um período (manhã, tarde ou noite).');
    }
    if (!in_array($status, STATUS_VALIDOS, true)) {
        erroJson('Status inválido.');
    }
    if ($status === 'concluido' && $resumo === '') {
        erroJson('Resumo é obrigatório para visitas concluídas.');
    }

    return [
        'local_id'  => $local_id,
        'tarefa_id' => $tarefa_id,
        'data'      => $data,
        // sempre JSON canônico, ex.: ["manha","tarde"]
        'periodo'   => json_encode($periodos, JSON_UNESCAPED_UNICODE),
        'status'    => $status,
        'objetivo'  => $objetivo !== '' ? $objetivo : null,
        'resumo'    => $resumo !== '' ? $resumo : null,
    ];
}

// ----------------------------------------------------------
// LISTAR AGENDAMENTOS
// ----------------------------------------------------------
if ($method === 'GET' && $action === 'listar') {
    $where  = [];
    $params = [];

    $colunasInt = [
        'id'         => 'a.id',
        'usuario_id' => 'a.usuario_id',
        'local_id'   => 'a.local_id',
        'tarefa_id'  => 'a.tarefa_id',
    ];
    foreach ($colunasInt as $chave => $coluna) {
        if (isset($_GET[$chave]) && $_GET[$chave] !== '') {
            $where[]  = "$coluna = ?";
            $params[] = (int)$_GET[$chave];
        }
        if (!empty($_GET[$chave . '_in'])) {
            $ids = listaInteiros((string)$_GET[$chave . '_in']);
            if ($ids) {
                $where[] = "$coluna IN (" . implode(',', array_fill(0, count($ids), '?')) . ')';
                foreach ($ids as $i) $params[] = $i;
            } else {
                $where[] = '1 = 0';
            }
        }
    }

    $dataInicio = $_GET['data_inicio'] ?? ($_GET['data_gte'] ?? null);
    $dataFim    = $_GET['data_fim']    ?? ($_GET['data_lte'] ?? null);
    if ($dataInicio) {
        if (!dataValida($dataInicio)) erroJson('data_inicio inválida.');
        $where[] = 'a.data >= ?'; $params[] = $dataInicio;
    }
    if ($dataFim) {
        if (!dataValida($dataFim)) erroJson('data_fim inválida.');
        $where[] = 'a.data <= ?'; $params[] = $dataFim;
    }

    if (!empty($_GET['status'])) {
        if (!in_array($_GET['status'], STATUS_VALIDOS, true)) erroJson('Status inválido.');
        $where[] = 'a.status = ?'; $params[] = $_GET['status'];
    }

    // O campo guarda JSON (["manha","tarde"]); os valores são ASCII e nenhum
    // é substring do outro, então LIKE é seguro (e aceita registros antigos).
    if (!empty($_GET['periodo'])) {
        $p = strtolower(trim((string)$_GET['periodo']));
        if (!in_array($p, PERIODOS_VALIDOS, true)) erroJson('Período inválido.');
        $where[] = 'a.periodo LIKE ?'; $params[] = '%' . $p . '%';
    }

    // ?order=data:desc,periodo:asc (somente colunas permitidas)
    $colunasOrdem = [
        'data' => 'a.data', 'id' => 'a.id', 'status' => 'a.status',
        'periodo' => 'a.periodo', 'created_at' => 'a.created_at',
    ];
    $orderBy = [];
    foreach (explode(',', (string)($_GET['order'] ?? '')) as $parte) {
        $partes = explode(':', trim($parte));
        $campo  = $partes[0] ?? '';
        $dir    = strtolower($partes[1] ?? 'asc') === 'desc' ? 'DESC' : 'ASC';
        if (isset($colunasOrdem[$campo])) $orderBy[] = $colunasOrdem[$campo] . ' ' . $dir;
    }
    if (!$orderBy) $orderBy = ['a.data DESC'];
    $orderBy[] = 'a.id DESC';

    $sql = 'SELECT a.*,
                   u.nome AS usuario_nome, u.funcao_id,
                   l.nome AS local_nome, l.cidade,
                   t.nome AS tarefa_nome
            FROM agendamentos a
            LEFT JOIN usuarios u ON u.id = a.usuario_id
            LEFT JOIN locais   l ON l.id = a.local_id
            LEFT JOIN tarefas  t ON t.id = a.tarefa_id';
    if ($where) $sql .= ' WHERE ' . implode(' AND ', $where);
    $sql .= ' ORDER BY ' . implode(', ', $orderBy);

    if (isset($_GET['limit']) && (int)$_GET['limit'] > 0) {
        $sql .= ' LIMIT ' . min(5000, (int)$_GET['limit']);
    }

    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
    $registros = $stmt->fetchAll();

    foreach ($registros as &$a) {
        $a['periodo'] = normalizarPeriodos($a['periodo'] ?? '');
        $a['locais'] = [
            'id'     => $a['local_id'],
            'nome'   => $a['local_nome'] ?? '—',
            'cidade' => $a['cidade']     ?? '—',
        ];
        $a['tarefas'] = [
            'id'   => $a['tarefa_id'],
            'nome' => $a['tarefa_nome'] ?? '—',
        ];
        $a['usuarios'] = [
            'id'        => $a['usuario_id'],
            'nome'      => $a['usuario_nome'] ?? '—',
            'funcao_id' => $a['funcao_id'] ?? null,
        ];
    }
    unset($a);

    jsonResponse($registros);
}

// ----------------------------------------------------------
// CRIAR
// ----------------------------------------------------------
if ($method === 'POST' && $action === 'criar') {
    $input = lerJson();
    $dados = lerPayloadAgendamento($input);

    // Só ADM pode agendar em nome de outra pessoa
    $usuario_id = ($user['escopo'] === 'adm' && !empty($input['usuario_id']))
        ? (int)$input['usuario_id']
        : (int)$user['id'];

    try {
        $stmt = $pdo->prepare(
            'INSERT INTO agendamentos
             (usuario_id, local_id, tarefa_id, data, periodo, status, objetivo, resumo)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
        );
        $stmt->execute([
            $usuario_id, $dados['local_id'], $dados['tarefa_id'], $dados['data'],
            $dados['periodo'], $dados['status'], $dados['objetivo'], $dados['resumo'],
        ]);
    } catch (PDOException $e) {
        if ($e->getCode() === '23000') erroJson('Local, tarefa ou usuário inválido.');
        throw $e;
    }

    jsonResponse(['ok' => true, 'id' => (int)$pdo->lastInsertId()], 201);
}

// ----------------------------------------------------------
// EDITAR (aceita PUT e POST: hospedagens compartilhadas às vezes bloqueiam PUT)
// ----------------------------------------------------------
if (($method === 'PUT' || $method === 'POST') && $action === 'editar') {
    $id = (int)($_GET['id'] ?? 0);
    if (!$id) erroJson('ID não informado.');

    $stmt = $pdo->prepare('SELECT usuario_id FROM agendamentos WHERE id = ?');
    $stmt->execute([$id]);
    $ag = $stmt->fetch();

    if (!$ag) erroJson('Agendamento não encontrado.', 404);
    if ($user['escopo'] !== 'adm' && (int)$ag['usuario_id'] !== (int)$user['id']) {
        erroJson('Sem permissão para alterar este agendamento.', 403);
    }

    $input = lerJson();
    $dados = lerPayloadAgendamento($input);

    $dono = (int)$ag['usuario_id'];
    if ($user['escopo'] === 'adm' && !empty($input['usuario_id'])) {
        $dono = (int)$input['usuario_id'];
    }

    try {
        $stmt = $pdo->prepare(
            'UPDATE agendamentos
             SET usuario_id = ?, local_id = ?, tarefa_id = ?, data = ?, periodo = ?,
                 status = ?, objetivo = ?, resumo = ?
             WHERE id = ?'
        );
        $stmt->execute([
            $dono, $dados['local_id'], $dados['tarefa_id'], $dados['data'],
            $dados['periodo'], $dados['status'], $dados['objetivo'], $dados['resumo'], $id,
        ]);
    } catch (PDOException $e) {
        if ($e->getCode() === '23000') erroJson('Local, tarefa ou usuário inválido.');
        throw $e;
    }

    jsonResponse(['ok' => true]);
}

// ----------------------------------------------------------
// EXCLUIR
// ----------------------------------------------------------
if (($method === 'DELETE' || $method === 'POST') && $action === 'excluir') {
    $id = (int)($_GET['id'] ?? 0);
    if (!$id) erroJson('ID não informado.');

    $stmt = $pdo->prepare('SELECT usuario_id FROM agendamentos WHERE id = ?');
    $stmt->execute([$id]);
    $ag = $stmt->fetch();

    if (!$ag) erroJson('Agendamento não encontrado.', 404);
    if ($user['escopo'] !== 'adm' && (int)$ag['usuario_id'] !== (int)$user['id']) {
        erroJson('Sem permissão para excluir este agendamento.', 403);
    }

    $pdo->prepare('DELETE FROM agendamentos WHERE id = ?')->execute([$id]);
    jsonResponse(['ok' => true]);
}

erroJson('Ação não encontrada.', 404);
