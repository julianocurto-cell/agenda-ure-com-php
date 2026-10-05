<?php
// ============================================================
// CARREGA .ENV
// ============================================================
require_once __DIR__ . '/env-loader.php';

// O .env fica na raiz do public_html (um nível acima de /api)
carregarEnv(dirname(__DIR__) . '/.env');

// ============================================================
// TIMEZONE
// ============================================================
date_default_timezone_set(env('APP_TIMEZONE', 'America/Sao_Paulo'));

// ============================================================
// MODO DA APLICAÇÃO
// ============================================================
define('APP_ENV',  env('APP_ENV', 'production'));
define('APP_DEBUG', APP_ENV === 'development');

if (APP_DEBUG) {
    error_reporting(E_ALL);
    ini_set('display_errors', '1');
} else {
    error_reporting(E_ALL & ~E_DEPRECATED & ~E_STRICT);
    ini_set('display_errors', '0');
    ini_set('log_errors', '1');
}

// ============================================================
// ERROS NÃO TRATADOS -> sempre JSON (o front nunca recebe página em branco)
// ============================================================
set_exception_handler(function (Throwable $e) {
    error_log('[API] ' . $e->getMessage() . ' @ ' . $e->getFile() . ':' . $e->getLine());
    if (!headers_sent()) {
        http_response_code(500);
        header('Content-Type: application/json; charset=utf-8');
        header('Cache-Control: no-store');
    }
    // Administradores logados veem o motivo real (facilita achar problema de banco/hospedagem);
    // visitantes e usuários comuns só veem a mensagem genérica.
    $ehAdm = isset($_SESSION) && (($_SESSION['usuario_escopo'] ?? '') === 'adm');
    $msg = (APP_DEBUG || $ehAdm)
        ? 'Erro interno: ' . $e->getMessage()
        : 'Erro interno do servidor';
    echo json_encode(['erro' => $msg, 'error' => $msg], JSON_UNESCAPED_UNICODE);
});

// ============================================================
// CONSTANTES DE SEGURANÇA (vindas do .env)
// ============================================================
define('MAX_TENTATIVAS_LOGIN', envInt('MAX_TENTATIVAS_LOGIN', 5));
define('BLOQUEIO_MINUTOS',     envInt('BLOQUEIO_MINUTOS', 15));
define('TOKEN_RESET_MINUTOS',  envInt('TOKEN_RESET_MINUTOS', 60));
define('SESSION_LIFETIME',     envInt('SESSION_LIFETIME', 28800));
define('SESSION_NAME',         env('SESSION_NAME', 'gv_sessao'));

// ============================================================
// CONEXÃO PDO
// ============================================================
function getPDO(): PDO {
    static $pdo = null;
    if ($pdo !== null) return $pdo;

    $host = env('DB_HOST', 'localhost');
    $port = env('DB_PORT', '3306');
    $name = env('DB_NAME');
    $user = env('DB_USER');
    $pass = env('DB_PASS');

    if (!$name || !$user) {
        http_response_code(500);
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode(['erro' => 'Configuração do banco ausente']);
        exit;
    }

    $dsn = "mysql:host={$host};port={$port};dbname={$name};charset=utf8mb4";

    try {
        $pdo = new PDO($dsn, $user, $pass, [
            PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES   => false,
            PDO::MYSQL_ATTR_INIT_COMMAND => "SET time_zone = '-03:00'",
        ]);
    } catch (PDOException $e) {
        // Nunca exponha credenciais em produção
        if (APP_DEBUG) {
            http_response_code(500);
            header('Content-Type: application/json; charset=utf-8');
            echo json_encode(['erro' => 'DB: ' . $e->getMessage()]);
        } else {
            error_log('[DB] ' . $e->getMessage());
            http_response_code(500);
            header('Content-Type: application/json; charset=utf-8');
            echo json_encode(['erro' => 'Erro interno do servidor']);
        }
        exit;
    }

    return $pdo;
}

// ============================================================
// SESSÃO SEGURA
// ============================================================
function iniciarSessao(): void {
    if (session_status() === PHP_SESSION_ACTIVE) return;

    $https = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
          || ($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https';

    session_set_cookie_params([
        'lifetime' => SESSION_LIFETIME,
        'path'     => '/',
        'secure'   => $https,
        'httponly' => true,
        'samesite' => 'Lax',
    ]);

    session_name(SESSION_NAME);
    session_start();

    if (!empty($_SESSION['ultima_atividade'])) {
        if (time() - $_SESSION['ultima_atividade'] > SESSION_LIFETIME) {
            session_unset();
            session_destroy();
            session_start();
        }
    }
    $_SESSION['ultima_atividade'] = time();
}

// ============================================================
// RESPOSTA JSON
// ============================================================
function jsonResponse($data, int $status = 200): void {
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('X-Content-Type-Options: nosniff');
    header('Cache-Control: no-store, no-cache, must-revalidate');
    echo json_encode($data, JSON_UNESCAPED_UNICODE);
    exit;
}

// ============================================================
// CSRF
// ============================================================
function gerarCsrfToken(): string {
    iniciarSessao();
    if (empty($_SESSION['csrf_token'])) {
        $_SESSION['csrf_token'] = bin2hex(random_bytes(32));
    }
    return $_SESSION['csrf_token'];
}

function validarCsrfToken(?string $token): bool {
    iniciarSessao();
    return !empty($_SESSION['csrf_token'])
        && !empty($token)
        && hash_equals($_SESSION['csrf_token'], $token);
}

// ============================================================
// HELPERS
// ============================================================
function lerJson(): array {
    $raw = file_get_contents('php://input');
    $data = json_decode($raw, true);
    return is_array($data) ? $data : [];
}

function ipCliente(): string {
    return $_SERVER['HTTP_X_FORWARDED_FOR']
        ?? $_SERVER['REMOTE_ADDR']
        ?? '0.0.0.0';
}

function registrarAcesso(?int $usuarioId, string $email, bool $sucesso, ?string $motivo = null): void {
    try {
        $pdo = getPDO();
        $stmt = $pdo->prepare(
            'INSERT INTO acessos_log (usuario_id, email, ip, user_agent, sucesso, motivo)
             VALUES (?, ?, ?, ?, ?, ?)'
        );
        $stmt->execute([
            $usuarioId, $email, ipCliente(),
            substr($_SERVER['HTTP_USER_AGENT'] ?? '', 0, 255),
            $sucesso ? 1 : 0, $motivo,
        ]);
    } catch (Throwable $e) { /* silencioso */ }
}

// ============================================================
// EXIGIR LOGIN / ADM (igual antes, só ajustado)
// ============================================================
function exigirLogin(): array {
    iniciarSessao();
    if (empty($_SESSION['usuario_id'])) {
        jsonResponse(['erro' => 'Não autenticado', 'codigo' => 'NAO_AUTENTICADO'], 401);
    }

    $pdo = getPDO();
    $stmt = $pdo->prepare(
        'SELECT id, nome, email, escopo, funcao_id, ativo
         FROM usuarios WHERE id = ? LIMIT 1'
    );
    $stmt->execute([$_SESSION['usuario_id']]);
    $u = $stmt->fetch();

    if (!$u) {
        session_unset(); session_destroy();
        jsonResponse(['erro' => 'Sessão inválida', 'codigo' => 'SESSAO_INVALIDA'], 401);
    }
    if (!$u['ativo']) {
        session_unset(); session_destroy();
        jsonResponse(['erro' => 'Usuário inativo', 'codigo' => 'USUARIO_INATIVO'], 403);
    }

    $_SESSION['usuario_nome']      = $u['nome'];
    $_SESSION['usuario_email']     = $u['email'];
    $_SESSION['usuario_escopo']    = $u['escopo'];
    $_SESSION['usuario_funcao_id'] = $u['funcao_id'];

    return $u;
}

function exigirAdm(): array {
    $u = exigirLogin();
    if ($u['escopo'] !== 'adm') {
        jsonResponse(['erro' => 'Acesso negado', 'codigo' => 'SEM_PERMISSAO'], 403);
    }
    return $u;
}

// ============================================================
// PERÍODOS E DATAS (usados por agendamentos.php)
// ============================================================
define('PERIODOS_VALIDOS', ['manha', 'tarde', 'noite']);

/**
 * Aceita array, JSON ('["manha","tarde"]'), CSV ('manha,tarde') ou string única
 * e devolve SEMPRE um array limpo, sem repetidos e na ordem manha > tarde > noite.
 * Valores fora da lista são descartados.
 */
function normalizarPeriodos($entrada): array {
    if (is_string($entrada)) {
        $txt = trim($entrada);
        $dec = json_decode($txt, true);
        if (json_last_error() === JSON_ERROR_NONE && is_array($dec)) {
            $entrada = $dec;
        } else {
            $entrada = preg_split('/\s*,\s*/', $txt, -1, PREG_SPLIT_NO_EMPTY);
        }
    }
    if (!is_array($entrada)) return [];

    $entrada = array_map(function ($v) { return is_string($v) ? strtolower(trim($v)) : $v; }, $entrada);
    $res = [];
    foreach (PERIODOS_VALIDOS as $p) {
        if (in_array($p, $entrada, true)) $res[] = $p;
    }
    return $res;
}

function dataValida($d): bool {
    if (!is_string($d)) return false;
    $dt = DateTime::createFromFormat('Y-m-d', $d);
    return $dt !== false && $dt->format('Y-m-d') === $d;
}

function erroJson(string $msg, int $status = 400): void {
    jsonResponse(['erro' => $msg, 'error' => $msg], $status);
}
