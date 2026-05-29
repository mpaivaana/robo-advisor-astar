import heapq
from flask import Flask, request, jsonify, send_from_directory
import os
import random

app = Flask(__name__, static_folder="static")

# ─────────────────────────────────────────────
# CUSTOS REAIS POR ATIVO (R$ por unidade de pp)
# ─────────────────────────────────────────────
ASSET_COSTS = {
    "Tesouro Selic":  1.0,
    "Tesouro IPCA":   2.0,
    "IVVB11":         5.0,
    "BOVA11":         8.0,

    "PETR4":         120.0,
    "VALE3":         100.0,
    "ITUB4":          90.0,

    "BTC":           300.0,
    "ETH":           220.0,

    "Dólar":          70.0,
    "Ouro":           60.0,

    "FII HGLG11":     12.0,
    "FII XPML11":     10.0,
}
DEFAULT_COST = 15.0


# ─────────────────────────────────────────────
# CENÁRIOS PRÉ-CONFIGURADOS
# ─────────────────────────────────────────────
SCENARIOS = {
    "diverge_basico": {
        "label": "Divergência básica (3 ativos)",
        "description": (
            "3 ativos com custos muito assimétricos."
        ),
        "assets": ["Tesouro Selic", "IVVB11", "PETR4"],
        "initial": [70, 20, 10],
        "target":  [10, 20, 70],
        "unit_pp": 10,
        "tolerance": 0,
        "portfolio_value": 10000,
    },

    "diverge_intermediario": {
        "label": "Ativo intermediário armadilha",
        "description": (
            "A* admissível encontra caminho mais barato."
        ),
        "assets": ["Tesouro IPCA", "BOVA11", "VALE3"],
        "initial": [80, 10, 10],
        "target":  [10, 10, 80],
        "unit_pp": 10,
        "tolerance": 0,
        "portfolio_value": 15000,
    },

    "sem_divergencia": {
        "label": "Sem divergência esperada (2 ativos)",
        "description": (
            "Apenas 2 ativos — só existe um caminho possível."
        ),
        "assets": ["Tesouro Selic", "PETR4"],
        "initial": [90, 10],
        "target":  [50, 50],
        "unit_pp": 10,
        "tolerance": 0,
        "portfolio_value": 10000,
    },
}


def asset_cost(name: str, custom_costs: dict = None) -> float:
    if custom_costs and name in custom_costs:
        return float(custom_costs[name])
    return ASSET_COSTS.get(name, DEFAULT_COST)


# ─────────────────────────────────────────────
# HEURÍSTICA
# ─────────────────────────────────────────────
HEURISTIC_FACTORS = {
    "admissible": 0.5,
    "non_admissible": 40.0,
}


def compute_heuristic(
    state,
    target,
    portfolio_value,
    unit_pp,
    asset_names,
    mode="admissible",
    custom_costs=None
):

    factor = HEURISTIC_FACTORS.get(mode, 0.5)

    total = 0

    for i in range(len(state)):

        diff = abs(target[i] - state[i])

        cost = asset_cost(asset_names[i], custom_costs)

        total += diff * cost

    return (total / unit_pp) * factor

def expand_node(state, target, unit_pp, portfolio_value,
                heuristic_mode, asset_names, custom_costs=None):

    successors = []
    n = len(state)

    for i in range(n):

        if state[i] < unit_pp:
            continue

        for j in range(n):

            if i == j:
                continue

            max_units = state[i] // unit_pp
            cost_j = asset_cost(asset_names[j], custom_costs)

            # ─────────────────────────────
            # REDUÇÃO DE COMPLEXIDADE
            # ─────────────────────────────

            possible_units = [1]

            if max_units >= 3:
                possible_units.append(max_units // 2)

            possible_units.append(max_units)

            possible_units = sorted(set(possible_units))

            # ─────────────────────────────
            # GERAÇÃO DOS SUCESSORES
            # ─────────────────────────────

            for units in possible_units:

                amount = units * unit_pp

                new_state = list(state)

                new_state[i] -= amount
                new_state[j] += amount

                # evita negativos
                if min(new_state) < 0:
                    continue

                new_state = tuple(new_state)

                step_cost = units * cost_j

                h = compute_heuristic(
                    new_state,
                    target,
                    portfolio_value,
                    unit_pp,
                    asset_names,
                    heuristic_mode,
                    custom_costs
                )

                if h > 50000:
                    continue

                successors.append(
                    (
                        new_state,
                        step_cost,
                        h,
                        i,
                        j,
                        amount
                    )
                )

    return successors


def is_goal(state, target, tolerance_pp):
    return all(abs(state[i] - target[i]) <= tolerance_pp for i in range(len(state)))


def astar(initial, target, asset_names, portfolio_value, unit_pp, tolerance_pp,
          heuristic_mode="admissible", max_iterations=2000, custom_costs=None):

    initial  = tuple(initial)
    target_t = tuple(target)

    if is_goal(initial, target_t, tolerance_pp):
        return {
            "solution_found": True,
            "path": [{"state": list(initial), "action": "Portfólio já está no alvo", "g": 0.0}],
            "total_cost": 0.0,
            "nodes_expanded": 0,
            "iterations_log": [],
            "heuristic_mode": heuristic_mode,
            "heuristic_factor": HEURISTIC_FACTORS.get(heuristic_mode, 0.5),
        }

    h0      = compute_heuristic(initial, target_t, portfolio_value, unit_pp, asset_names, heuristic_mode, custom_costs)
    counter = 0
    heap    = [(h0, counter, 0.0, initial, None, "Inicialização")]
    open_map = {initial: (h0, 0.0)}
    closed   = {}
    parent   = {initial: (None, "Inicialização", 0.0)}

    iterations_log = []
    nodes_expanded = 0

    while heap and nodes_expanded < max_iterations:
        f, _, g, state, parent_state, action = heapq.heappop(heap)

        if state in closed and closed[state] <= g:
            continue

        closed[state] = g
        nodes_expanded += 1

        open_snapshot = [
            {"state": list(s), "f": round(fv, 4), "g": round(gv, 4), "h": round(fv - gv, 4)}
            for s, (fv, gv) in open_map.items() if s not in closed
        ]
        closed_snapshot = [
            {"state": list(s), "g": round(gv, 4)}
            for s, gv in closed.items()
        ]

        h_val = compute_heuristic(state, target_t, portfolio_value, unit_pp, asset_names, heuristic_mode, custom_costs)
        generated_children = []

        successors = expand_node(
            state,
            target_t,
            unit_pp,
            portfolio_value,
            heuristic_mode,
            asset_names,
            custom_costs
        )

        for new_state, step_cost, h_new, from_i, to_i, amount in successors:
            generated_children.append({
                "state": list(new_state),
                "g": round(g + step_cost, 4),
                "h": round(h_new, 4),
                "f": round(g + step_cost + h_new, 4)
            })

        iterations_log.append({
            "iteration": nodes_expanded,
            "state": list(state),
            "g": round(g, 4),
            "h": round(h_val, 4),
            "f": round(f, 4),
            "open_list": open_snapshot,
            "closed_list": closed_snapshot,
            "generated_children": generated_children
        })

        if is_goal(state, target_t, tolerance_pp):
            path = []
            cur  = state
            while cur is not None:
                par, act, gc = parent[cur]
                path.append({"state": list(cur), "action": act, "g": round(gc, 4)})
                cur = par
            path.reverse()
            return {
                "solution_found": True,
                "path":           path,
                "total_cost":     round(g, 4),
                "nodes_expanded": nodes_expanded,
                "iterations_log": iterations_log,
                "heuristic_mode": heuristic_mode,
                "heuristic_factor": HEURISTIC_FACTORS.get(heuristic_mode, 0.5),
            }

        for new_state, step_cost, h_new, from_i, to_i, amount in successors:
            new_g = g + step_cost
            if new_state in closed and closed[new_state] <= new_g:
                continue
            new_f        = new_g + h_new
            action_label = (
                f"Vende {amount}pp {asset_names[from_i]} → "
                f"Compra {amount}pp {asset_names[to_i]} (R${step_cost:.2f})"
            )
            if new_state not in open_map or open_map[new_state][1] > new_g:
                open_map[new_state] = (new_f, new_g)
                parent[new_state]   = (state, action_label, new_g)
                counter += 1
                heapq.heappush(heap, (new_f, counter, new_g, new_state, state, action_label))

    return {
        "solution_found": False,
        "nodes_expanded": nodes_expanded,
        "iterations_log": iterations_log,
        "heuristic_mode": heuristic_mode,
        "heuristic_factor": HEURISTIC_FACTORS.get(heuristic_mode, 0.5),
    }


# ─────────────────────────────────────────────
# ROTAS
# ─────────────────────────────────────────────

@app.route("/")
def index():
    return send_from_directory(".", "astar_frontend.html")


@app.route("/run", methods=["POST"])
def run():
    data          = request.json
    assets        = data.get("assets",         ["Tesouro Selic", "PETR4"])
    initial       = data.get("initial",        [90, 10])
    target        = data.get("target",         [50, 50])
    portfolio_val = float(data.get("portfolio_value", 10000))
    unit_pp       = int(data.get("unit_pp",    10))
    tolerance     = int(data.get("tolerance",  0))
    mode          = data.get("heuristic_mode", "admissible")
    custom_costs  = data.get("custom_costs",   {})

    if len(assets) > 4:
        return jsonify({
            "error": "Máximo de 4 ativos permitido"
        }), 400

    if sum(initial) != 100 or sum(target) != 100:
        return jsonify({"error": "Alocações devem somar 100%"}), 400

    result = astar(initial=initial, target=target, asset_names=assets,
                   portfolio_value=portfolio_val, unit_pp=unit_pp,
                   tolerance_pp=tolerance, heuristic_mode=mode,
                   custom_costs=custom_costs)
    return jsonify(result)


@app.route("/compare", methods=["POST"])
def compare():
    data          = request.json
    assets        = data.get("assets",         ["Tesouro Selic", "PETR4"])
    initial       = data.get("initial",        [90, 10])
    target        = data.get("target",         [50, 50])
    portfolio_val = float(data.get("portfolio_value", 10000))
    unit_pp       = int(data.get("unit_pp",    10))
    tolerance     = int(data.get("tolerance",  0))
    custom_costs  = data.get("custom_costs",   {})

    if len(assets) > 4:
        return jsonify({
            "error": "Máximo de 4 ativos permitido"
        }), 400

    results = {}
    for mode in ("admissible", "non_admissible"):
        results[mode] = astar(initial=initial, target=target, asset_names=assets,
                              portfolio_value=portfolio_val, unit_pp=unit_pp,
                              tolerance_pp=tolerance, heuristic_mode=mode,
                              custom_costs=custom_costs)
    adm = results["admissible"]
    non = results["non_admissible"]
    diverged = (
        adm.get("solution_found") and non.get("solution_found") and
        adm["total_cost"] != non["total_cost"]
    )
    results["diverged"]       = diverged
    results["cost_delta"]     = round(non.get("total_cost", 0) - adm.get("total_cost", 0), 4) if diverged else 0
    results["suboptimal_pct"] = round(
        (non["total_cost"] - adm["total_cost"]) / adm["total_cost"] * 100, 1
    ) if diverged and adm["total_cost"] > 0 else 0

    return jsonify(results)

@app.route("/random_state", methods=["POST"])
def random_state():

    data = request.json

    n = int(data.get("n", 3))
    unit_pp = int(data.get("unit_pp", 10))

    n = max(2, min(20, n))

    if 100 // unit_pp < n:
        return jsonify({
            "error": (
                f"Com unidade de {unit_pp}pp "
                f"não é possível gerar {n} ativos."
            )
        }), 400

    remaining = 100
    allocation = []

    for i in range(n - 1):

        max_possible = remaining - ((n - i - 1) * unit_pp)

        value = random.randrange(
            unit_pp,
            max_possible + unit_pp,
            unit_pp
        )

        allocation.append(value)

        remaining -= value

    allocation.append(remaining)

    random.shuffle(allocation)

    return jsonify({
        "allocation": allocation
    })


@app.route("/scenarios", methods=["GET"])
def get_scenarios():
    return jsonify(SCENARIOS)


@app.route("/asset_costs", methods=["GET"])
def get_asset_costs():
    return jsonify(ASSET_COSTS)


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5050))
    print(f"\n🚀  Servidor rodando em http://localhost:{port}\n")
    app.run(host="0.0.0.0", debug=False, port=port)