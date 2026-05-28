"""
Agente de Rebalanceamento A* —
SI702 - Inteligência Artificial | UNICAMP FT
"""

import heapq
import math
from flask import Flask, request, jsonify
from flask import send_from_directory
import os

app = Flask(__name__, static_folder=".")

# ─────────────────────────────────────────────
# NÚCLEO DO AGENTE A*
# ─────────────────────────────────────────────

def compute_heuristic(state, target, portfolio_value, cost_per_unit, unit_pp, mode="admissible"):
    """
    Admissível  : Distância de Manhattan Financeira com fator 1/2 (nunca superestima).
    Não-admissível: Mesma fórmula sem o fator 1/2 (pode superestimar → A* não garante ótimo).
    """
    total_deviation = sum(abs(state[i] - target[i]) for i in range(len(state)))
    monetary_deviation = (total_deviation / 100) * portfolio_value
    c_min = cost_per_unit / (unit_pp * portfolio_value / 100)

    if mode == "admissible":
        return 0.5 * monetary_deviation * c_min
    else:  
        return 0.9 * monetary_deviation * c_min


def expand_node(state, target, unit_pp, cost_per_unit, portfolio_value, heuristic_mode):
    """Gera sucessores válidos: transfere `unit_pp` de ativo i → ativo j."""
    successors = []
    n = len(state)
    for i in range(n):
        for j in range(n):
            if i == j:
                continue
            if state[i] >= unit_pp:
                new_state = list(state)
                new_state[i] -= unit_pp
                new_state[j] += unit_pp
                new_state = tuple(new_state)
                h = compute_heuristic(new_state, target, portfolio_value,
                                      cost_per_unit, unit_pp, heuristic_mode)
                successors.append((new_state, cost_per_unit, h, i, j))
    return successors


def is_goal(state, target, tolerance_pp):
    return all(abs(state[i] - target[i]) <= tolerance_pp for i in range(len(state)))


def astar(
    initial,
    target,
    asset_names,
    portfolio_value,
    cost_per_unit,
    unit_pp,
    tolerance_pp,
    heuristic_mode="admissible",
    max_iterations=500,
):
    """
    Executa A* e retorna caminho ótimo + log completo de cada iteração.
    Retorna dict com: path, iterations_log, open_list_snapshots, closed_list_snapshots,
                      total_cost, nodes_expanded, solution_found
    """
    initial = tuple(initial)
    target_t = tuple(target)

    h0 = compute_heuristic(initial, target_t, portfolio_value, cost_per_unit, unit_pp, heuristic_mode)
   
    counter = 0  
    heap = [(h0, counter, 0.0, initial, None, "Inicialização")]
    open_map = {initial: (h0, 0.0)}  
    closed = {}                        
    parent = {initial: (None, "Inicialização", 0.0)}

    iterations_log = []
    nodes_expanded = 0

    while heap and nodes_expanded < max_iterations:
        f, _, g, state, parent_state, action = heapq.heappop(heap)

        if state in closed and closed[state] <= g:
            continue

        closed[state] = g
        print("OPEN SIZE:", len(open_map), "CLOSED SIZE:", len(closed))
        nodes_expanded += 1

        open_snapshot = [
            {"state": list(s), "f": round(fv, 4), "g": round(gv, 4),
             "h": round(fv - gv, 4)}
            for s, (fv, gv) in open_map.items() if s not in closed
        ]
        closed_snapshot = [
            {"state": list(s), "g": round(gv, 4)}
            for s, gv in closed.items()
        ]

        h_val = compute_heuristic(state, target_t, portfolio_value,
                                  cost_per_unit, unit_pp, heuristic_mode)

        iterations_log.append({
            "iteration": nodes_expanded,
            "state": list(state),
            "g": round(g, 4),
            "h": round(h_val, 4),
            "f": round(f, 4),
            "action": action,
            "open_list": open_snapshot,
            "closed_list": closed_snapshot,
        })

        if is_goal(state, target_t, tolerance_pp):

            print("🎯 OBJETIVO ENCONTRADO!", state, "custo final:", g)
            path = []
            cur = state
            while cur is not None:
                par, act, gc = parent[cur]
                path.append({"state": list(cur), "action": act, "g": round(gc, 4)})
                cur = par
            path.reverse()
            return {
                "solution_found": True,
                "path": path,
                "total_cost": round(g, 4),
                "nodes_expanded": nodes_expanded,
                "iterations_log": iterations_log,
                "heuristic_mode": heuristic_mode,
            }

        for new_state, step_cost, h_new, from_i, to_i in expand_node(
            state, target_t, unit_pp, cost_per_unit, portfolio_value, heuristic_mode
        ):
            new_g = g + step_cost

            print("  vizinho:", new_state, "de", state, "custo:", new_g)

            new_f = new_g + h_new
            action_label = (
                f"Vende {unit_pp}% {asset_names[from_i]} → "
                f"Compra {unit_pp}% {asset_names[to_i]} (C=R${step_cost:.2f})"
            )

            if new_state in closed and closed[new_state] <= new_g:
                continue

            if new_state not in open_map or open_map[new_state][1] > new_g:
                open_map[new_state] = (new_f, new_g)
                parent[new_state] = (state, action_label, new_g)
                counter += 1
                heapq.heappush(heap, (new_f, counter, new_g, new_state, state, action_label))

    return {"solution_found": False, "nodes_expanded": nodes_expanded,
            "iterations_log": iterations_log, "heuristic_mode": heuristic_mode}


# ─────────────────────────────────────────────
# ROTAS FLASK
# ─────────────────────────────────────────────

@app.route("/")
def index():
    return send_from_directory(".", "astar_frontend.html")


@app.route("/run", methods=["POST"])
def run():
    data = request.json
    assets        = data.get("assets", ["RF", "PETR4"])
    initial       = data.get("initial", [90, 10])
    target        = data.get("target", [50, 50])
    portfolio_val = float(data.get("portfolio_value", 10000))
    cost_per_unit = float(data.get("cost_per_unit", 15))
    unit_pp       = int(data.get("unit_pp", 10))
    tolerance     = int(data.get("tolerance", 2))
    mode          = data.get("heuristic_mode", "admissible")

    if sum(initial) != 100 or sum(target) != 100:
        return jsonify({"error": "Alocações devem somar 100%"}), 400
    if len(assets) != len(initial) or len(assets) != len(target):
        return jsonify({"error": "Número de ativos inconsistente"}), 400

    result = astar(
        initial=initial,
        target=target,
        asset_names=assets,
        portfolio_value=portfolio_val,
        cost_per_unit=cost_per_unit,
        unit_pp=unit_pp,
        tolerance_pp=tolerance,
        heuristic_mode=mode,
    )
    return jsonify(result)


@app.route("/compare", methods=["POST"])
def compare():
    """Roda admissível E não-admissível com os mesmos parâmetros e retorna ambos."""
    data = request.json
    results = {}
    for mode in ("admissible", "non_admissible"):
        data["heuristic_mode"] = mode
        assets        = data.get("assets", ["RF", "PETR4"])
        initial       = data.get("initial", [90, 10])
        target        = data.get("target", [50, 50])
        portfolio_val = float(data.get("portfolio_value", 10000))
        cost_per_unit = float(data.get("cost_per_unit", 15))
        unit_pp       = int(data.get("unit_pp", 10))
        tolerance     = int(data.get("tolerance", 2))
        results[mode] = astar(
            initial=initial, target=target, asset_names=assets,
            portfolio_value=portfolio_val, cost_per_unit=cost_per_unit,
            unit_pp=unit_pp, tolerance_pp=tolerance, heuristic_mode=mode,
        )
    return jsonify(results)


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5050))
    print(f"\n🚀  Servidor rodando em http://localhost:{port}\n")
    app.run(host="0.0.0.0", debug=False, port=port)