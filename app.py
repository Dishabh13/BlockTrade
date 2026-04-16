from flask import Flask, jsonify, request, render_template
import hashlib, json, time, random, uuid
from datetime import datetime
import threading

app = Flask(__name__)

# ─────────────────────────────────────────
#  IN-MEMORY STATE
# ─────────────────────────────────────────
traders = {
    "TRADER_A": {"name": "Alice",  "balance": 50000.0},
    "TRADER_B": {"name": "Bob",    "balance": 30000.0},
    "TRADER_C": {"name": "Carol",  "balance": 20000.0},
}
assets = {
    "TRADER_A": {"AAPL": 50, "TSLA": 0,  "GOOG": 20},
    "TRADER_B": {"AAPL": 0,  "TSLA": 100,"GOOG": 0},
    "TRADER_C": {"AAPL": 10, "TSLA": 10, "GOOG": 30},
}
buy_orders  = []
sell_orders = []
pending_trades   = []
committed_trades = []
aborted_trades   = []
logs = []

def process_trade_async(trade):
    def trader_validation():
        buyer = trade['buyer_id']
        cost = trade['quantity'] * trade['price']
        balance = traders[buyer]['balance']

        time.sleep(random.uniform(0.5, 2))  # simulate delay

        if balance >= cost:
            trade['trader_validated'] = True
            add_log("Trader Authority", f"✓ {buyer} funds locked", "success")
        else:
            trade['trader_validated'] = False
            add_log("Trader Authority", f"✗ {buyer} insufficient funds", "error")

    def asset_validation():
        seller = trade['seller_id']
        stock = trade['stock']
        qty = trade['quantity']
        owned = assets.get(seller, {}).get(stock, 0)

        time.sleep(random.uniform(0.5, 2))  # simulate delay

        if owned >= qty:
            trade['asset_validated'] = True
            add_log("Asset Authority", f"✓ {seller} shares locked", "success")
        else:
            trade['asset_validated'] = False
            add_log("Asset Authority", f"✗ {seller} insufficient shares", "error")

    # Run both in parallel
    t1 = threading.Thread(target=trader_validation)
    t2 = threading.Thread(target=asset_validation)

    t1.start()
    t2.start()

    # Wait for both to finish
    t1.join()
    t2.join()

    # After both done → call coordinator
    coordinate_trade_auto(trade)

def coordinate_trade_auto(trade):
    tv = trade['trader_validated']
    av = trade['asset_validated']

    if tv and av:
        trade['status'] = 'committed'

        buyer, seller = trade['buyer_id'], trade['seller_id']
        cost  = trade['quantity'] * trade['price']
        stock = trade['stock']
        qty   = trade['quantity']

        # 🔥 NEW: Update order quantities AFTER successful commit
        buy_order = next(o for o in buy_orders if o['id'] == trade['buy_order_id'])
        sell_order = next(o for o in sell_orders if o['id'] == trade['sell_order_id'])

        buy_order['quantity'] -= qty
        sell_order['quantity'] -= qty

        # If fully filled → mark as filled
        if buy_order['quantity'] <= 0:
            buy_order['status'] = 'filled'

        if sell_order['quantity'] <= 0:
            sell_order['status'] = 'filled'

        traders[buyer]['balance'] -= cost
        traders[seller]['balance'] += cost
        assets[buyer][stock] = assets[buyer].get(stock, 0) + qty
        assets[seller][stock] -= qty

        block = Block(len(blockchain), {
            "buyer_id": buyer,
            "seller_id": seller,
            "stock": stock,
            "quantity": qty,
            "price": trade['price']
        }, blockchain[-1].hash)

        blockchain.append(block)

        # Append to Trader Authority chain
        ta_block = Block(len(trader_authority_chain), {
            "trade_id":  trade['id'],
            "buyer_id":  buyer,
            "cost":      round(trade['quantity'] * trade['price'], 2),
            "validated": True,
            "result":    "FUNDS_LOCKED",
            "main_block": block.index
        }, trader_authority_chain[-1].hash)
        trader_authority_chain.append(ta_block)

        # Append to Asset Authority chain
        aa_block = Block(len(asset_authority_chain), {
            "trade_id":  trade['id'],
            "seller_id": seller,
            "stock":     stock,
            "quantity":  qty,
            "validated": True,
            "result":    "SHARES_LOCKED",
            "main_block": block.index
        }, asset_authority_chain[-1].hash)
        asset_authority_chain.append(aa_block)

        committed_trades.append(trade)
        pending_trades.remove(trade)

        add_log("Coordinator", f"✅ AUTO COMMIT — Block #{block.index}", "success")

    else:
      trade['status'] = 'aborted'
      aborted_trades.append(trade)
      pending_trades.remove(trade)

      add_log("Coordinator", f"❌ AUTO ABORT — Retrying alternative match", "error")

      # 🔥 Retry matching automatically
      threading.Thread(target=retry_matching).start()

def retry_matching():
    time.sleep(1)  # simulate retry delay

    add_log("Matching Engine", "🔄 Retrying matching after failure...", "info")

    for buy in buy_orders:
        if buy['status'] == 'open' and buy['quantity'] > 0:
            for sell in sell_orders:
                if sell['status'] == 'open' and sell['quantity'] > 0:

                    if (buy['stock'] == sell['stock'] and
                        buy['price'] >= sell['price'] and
                        buy['trader_id'] != sell['trader_id']):

                        trade_qty = min(buy['quantity'], sell['quantity'])

                        trade = {
                            "id": str(uuid.uuid4()),
                            "buyer_id": buy['trader_id'],
                            "seller_id": sell['trader_id'],
                            "stock": buy['stock'],
                            "quantity": trade_qty,
                            "price": sell['price'],
                            "status": "pending",
                            "trader_validated": None,
                            "asset_validated": None,
                            "buy_order_id": buy['id'],
                            "sell_order_id": sell['id'],
                            "timestamp": datetime.now().isoformat()
                        }

                        pending_trades.append(trade)

                        threading.Thread(target=process_trade_async, args=(trade,)).start()

                        add_log("Matching Engine", "🔁 Alternative trade triggered", "info")

                        return  # only retry one trade

def add_log(source, message, level="info"):
    logs.append({
        "time": datetime.now().strftime("%H:%M:%S"),
        "source": source,
        "message": message,
        "level": level
    })
    if len(logs) > 200:
        logs.pop(0)

# ─────────────────────────────────────────
#  BLOCKCHAIN
# ─────────────────────────────────────────
class Block:
    def __init__(self, index, trade_data, previous_hash):
        self.index         = index
        self.timestamp     = datetime.now().isoformat()
        self.trade_data    = trade_data
        self.previous_hash = previous_hash
        self.hash          = self.compute_hash()

    def compute_hash(self):
        block_str = json.dumps({
            "index": self.index,
            "timestamp": self.timestamp,
            "trade_data": self.trade_data,
            "previous_hash": self.previous_hash
        }, sort_keys=True)
        return hashlib.sha256(block_str.encode()).hexdigest()

    def to_dict(self):
        return {
            "index": self.index,
            "timestamp": self.timestamp,
            "trade_data": self.trade_data,
            "previous_hash": self.previous_hash,
            "hash": self.hash
        }

# Genesis block
blockchain = [Block(0, {"type": "GENESIS", "message": "Chain Initialized"}, "0" * 64)]
add_log("Blockchain", "Genesis block created", "success")

# Authority-specific chains
trader_authority_chain = [Block(0, {"type": "GENESIS", "message": "Trader Authority Chain Initialized"}, "0" * 64)]
asset_authority_chain  = [Block(0, {"type": "GENESIS", "message": "Asset Authority Chain Initialized"},  "0" * 64)]

def is_chain_valid():
    for i in range(1, len(blockchain)):
        cur, prev = blockchain[i], blockchain[i-1]
        if cur.hash != cur.compute_hash():
            return False
        if cur.previous_hash != prev.hash:
            return False
    return True

# ─────────────────────────────────────────
#  HTML TEMPLATE
# ─────────────────────────────────────────
# ─────────────────────────────────────────
#  ROUTES
# ─────────────────────────────────────────
@app.route('/')
def index():
    return render_template('blocktrade-dashboard.html')

@app.route('/api/state')
def api_state():
    return jsonify({
        "traders":          traders,
        "assets":           assets,
        "buy_orders":       buy_orders,
        "sell_orders":      sell_orders,
        "pending_trades":   pending_trades,
        "committed_trades": committed_trades,
        "aborted_trades":   aborted_trades,
        "total_orders":     len(buy_orders) + len(sell_orders),
        "committed":        len(committed_trades),
        "aborted":          len(aborted_trades),
        "blocks":           len(blockchain),
        "logs":             logs
    })

# ─────────────────────────────────────────
#  ADD TRADER
# ─────────────────────────────────────────
@app.route('/api/add_trader', methods=['POST'])
def add_trader():
    data = request.json
    name = data.get('name')
    balance = float(data.get('balance', 0))

    trader_id = f"TRADER_{uuid.uuid4().hex[:4].upper()}"

    traders[trader_id] = {
        "name": name,
        "balance": balance
    }

    assets[trader_id] = {}

    add_log("Admin", f"New trader added: {trader_id} ({name})", "success")

    return jsonify({
        "success": True,
        "trader_id": trader_id
    })


# ─────────────────────────────────────────
#  ADD ASSET
# ─────────────────────────────────────────
@app.route('/api/add_asset', methods=['POST'])
def add_asset():
    data = request.json
    stock = data.get('stock').upper()

    for trader in assets:
        assets[trader][stock] = 0

    add_log("Admin", f"New asset added: {stock}", "success")

    return jsonify({
        "success": True,
        "stock": stock
    })

@app.route('/api/place_order', methods=['POST'])
def api_place_order():
    data = request.json
    trader_id  = data.get('trader_id')
    order_type = data.get('order_type')
    stock      = data.get('stock')
    quantity   = data.get('quantity', 0)
    price      = data.get('price', 0)

    if not all([trader_id, order_type, stock, quantity, price]):
        return jsonify({"success": False, "error": "Missing fields"})
    if trader_id not in traders:
        return jsonify({"success": False, "error": "Unknown trader"})

    order = {
        "id":        str(uuid.uuid4()),
        "trader_id": trader_id,
        "type":      order_type,
        "stock":     stock,
        "quantity":  quantity,
        "price":     price,
        "status":    "open",
        "timestamp": datetime.now().isoformat()
    }
    if order_type == "BUY":
        buy_orders.append(order)
    else:
        sell_orders.append(order)

    add_log("Trader Node", f"{trader_id} placed {order_type} {quantity}x{stock} @ ₹{price}", "info")
    print(f"[Trader Node] {trader_id} placed {order_type} {quantity}x{stock} @ ₹{price}")
    return jsonify({"success": True, "order_id": order["id"]})

@app.route('/api/match_orders', methods=['POST'])
def api_match_orders():
    found = False

    for buy in list(buy_orders):
        for sell in list(sell_orders):

            if (buy['stock'] == sell['stock'] and
                buy['price'] >= sell['price'] and
                buy['trader_id'] != sell['trader_id'] and
                buy['status'] == 'open' and sell['status'] == 'open' and
                buy['quantity'] > 0 and sell['quantity'] > 0):

                trade_qty = min(buy['quantity'], sell['quantity'])

                trade = {
                    "id": str(uuid.uuid4()),
                    "buyer_id": buy['trader_id'],
                    "seller_id": sell['trader_id'],
                    "stock": buy['stock'],
                    "quantity": trade_qty,
                    "price": sell['price'],
                    "status": "pending",
                    "trader_validated": None,
                    "asset_validated": None,
                    "buy_order_id": buy['id'],
                    "sell_order_id": sell['id'],
                    "timestamp": datetime.now().isoformat()
                }

                pending_trades.append(trade)

                # 🚀 Async validation
                threading.Thread(target=process_trade_async, args=(trade,)).start()

                add_log("Matching Engine",
                        f"Queued Trade: {buy['trader_id']} ↔ {sell['trader_id']} ({trade_qty}x{buy['stock']})",
                        "info")

                found = True

    if found:
        return jsonify({"success": True, "message": "Trades queued for validation"})
    else:
        add_log("Matching Engine", "No compatible orders to match", "warn")
        return jsonify({"success": False, "message": "No matching orders found"})

@app.route('/api/validate_trader', methods=['POST'])
def api_validate_trader():
    trade_id = request.json.get('trade_id')
    trade = next((t for t in pending_trades if t['id'] == trade_id), None)
    if not trade:
        return jsonify({"success": False, "error": "Trade not found"})

    buyer   = trade['buyer_id']
    cost    = trade['quantity'] * trade['price']
    balance = traders[buyer]['balance']

    if balance >= cost:
        trade['trader_validated'] = True
        add_log("Trader Authority", f"✓ Funds OK — {buyer} has ₹{balance:.2f}, need ₹{cost:.2f}. Locked.", "success")
        print(f"[Trader Authority] Funds OK for {buyer}")
        return jsonify({"success": True, "message": "Funds locked"})
    else:
        trade['trader_validated'] = False
        add_log("Trader Authority", f"✗ Insufficient funds — {buyer} has ₹{balance:.2f}, need ₹{cost:.2f}", "error")
        print(f"[Trader Authority] FAIL: Insufficient funds for {buyer}")
        return jsonify({"success": False, "message": "Insufficient balance"})

@app.route('/api/validate_asset', methods=['POST'])
def api_validate_asset():
    trade_id = request.json.get('trade_id')
    trade = next((t for t in pending_trades if t['id'] == trade_id), None)
    if not trade:
        return jsonify({"success": False, "error": "Trade not found"})

    seller = trade['seller_id']
    stock  = trade['stock']
    qty    = trade['quantity']
    owned  = assets.get(seller, {}).get(stock, 0)

    if owned >= qty:
        trade['asset_validated'] = True
        add_log("Asset Authority", f"✓ Shares OK — {seller} owns {owned}x{stock}, needs {qty}. Locked.", "success")
        print(f"[Asset Authority] Shares OK for {seller}")
        return jsonify({"success": True, "message": "Shares locked"})
    else:
        trade['asset_validated'] = False
        add_log("Asset Authority", f"✗ Insufficient shares — {seller} owns {owned}x{stock}, needs {qty}", "error")
        print(f"[Asset Authority] FAIL: Insufficient shares for {seller}")
        return jsonify({"success": False, "message": "Insufficient shares"})

@app.route('/api/coordinate_trade', methods=['POST'])
def api_coordinate_trade():
    # Find first trade where both validations are done
    trade = next((t for t in pending_trades
                  if t['trader_validated'] is not None and t['asset_validated'] is not None), None)
    if not trade:
        return jsonify({"success": False, "message": "No trade ready for coordination"})

    tv = trade['trader_validated']
    av = trade['asset_validated']

    if tv and av:
        # COMMIT
        trade['status'] = 'committed'
        buyer, seller = trade['buyer_id'], trade['seller_id']
        cost  = trade['quantity'] * trade['price']
        stock = trade['stock']
        qty   = trade['quantity']

        traders[buyer]['balance']            -= cost
        traders[seller]['balance']           += cost
        assets[buyer][stock]                  = assets[buyer].get(stock, 0) + qty
        assets[seller][stock]                 = assets[seller].get(stock, 0) - qty

        prev_hash = blockchain[-1].hash
        block = Block(len(blockchain), {
            "buyer_id":  buyer,
            "seller_id": seller,
            "stock":     stock,
            "quantity":  qty,
            "price":     trade['price'],
            "trade_id":  trade['id']
        }, prev_hash)
        blockchain.append(block)

        # Append to Trader Authority chain
        ta_block = Block(len(trader_authority_chain), {
            "trade_id":  trade['id'],
            "buyer_id":  buyer,
            "cost":      round(qty * trade['price'], 2),
            "validated": True,
            "result":    "FUNDS_LOCKED",
            "main_block": block.index
        }, trader_authority_chain[-1].hash)
        trader_authority_chain.append(ta_block)

        # Append to Asset Authority chain
        aa_block = Block(len(asset_authority_chain), {
            "trade_id":  trade['id'],
            "seller_id": seller,
            "stock":     stock,
            "quantity":  qty,
            "validated": True,
            "result":    "SHARES_LOCKED",
            "main_block": block.index
        }, asset_authority_chain[-1].hash)
        asset_authority_chain.append(aa_block)

        committed_trades.append(trade)
        pending_trades.remove(trade)

        add_log("Coordinator", f"✅ COMMIT — Block #{block.index} added. Trade {trade['id'][-8:]}", "success")
        print(f"[Coordinator] COMMIT — Block #{block.index} added")
        return jsonify({"success": True, "decision": "COMMIT", "block": block.index})
    else:
        # ABORT
        trade['status'] = 'aborted'
        aborted_trades.append(trade)
        pending_trades.remove(trade)

        reason = []
        if not tv: reason.append("Trader check FAILED")
        if not av: reason.append("Asset check FAILED")
        add_log("Coordinator", f"❌ ABORT — {', '.join(reason)}", "error")
        print(f"[Coordinator] ABORT — {', '.join(reason)}")
        return jsonify({"success": True, "decision": "ABORT", "reason": reason})

@app.route('/api/blockchain')
def api_blockchain():
    return jsonify({
        "blocks": [b.to_dict() for b in blockchain],
        "valid":  is_chain_valid(),
        "length": len(blockchain)
    })

@app.route('/api/authority_chains')
def api_authority_chains():
    def chain_valid(chain):
        for i in range(1, len(chain)):
            cur, prev = chain[i], chain[i-1]
            if cur.hash != cur.compute_hash(): return False
            if cur.previous_hash != prev.hash: return False
        return True

    return jsonify({
        "trader_authority": {
            "blocks": [b.to_dict() for b in trader_authority_chain],
            "valid":  chain_valid(trader_authority_chain),
            "length": len(trader_authority_chain)
        },
        "asset_authority": {
            "blocks": [b.to_dict() for b in asset_authority_chain],
            "valid":  chain_valid(asset_authority_chain),
            "length": len(asset_authority_chain)
        }
    })

if __name__ == '__main__':
    print("=" * 55)
    print("  BlockTrade — Hybrid Blockchain Trading Demo")
    print("=" * 55)
    print("  Open: http://127.0.0.1:5000")
    print("  Pre-loaded traders: TRADER_A, TRADER_B, TRADER_C")
    print("  Workflow:")
    print("    1. Trader Node  → Place BUY/SELL orders")
    print("    2. Matching     → Run matching engine")
    print("    3. Trader Auth  → Validate buyer funds")
    print("    4. Asset Auth   → Validate seller shares")
    print("    5. Coordinator  → Commit or Abort")
    print("    6. Ledger       → See blockchain update")
    print("=" * 55)
    app.run(debug=True, port=5000)
