Blockchain-Based Trading Workflow

BlockTrade is a lightweight prototype that simulates how a blockchain-backed trading system operates. It combines a Flask-based web interface with a simplified blockchain ledger to record and validate trading activity.

⚙️ How It Works
User Actions → Transactions
When a user performs a buy or sell operation, the system creates a transaction containing details such as trader ID, asset, quantity, price, and timestamp.
Transaction Processing & Validation
Each transaction is validated before execution to ensure:
The buyer has sufficient balance
The seller has enough assets
The transaction data is consistent
Block Creation
Valid transactions are grouped into blocks. Each block contains:
A list of transactions
A timestamp
A unique hash
The hash of the previous block
Blockchain Formation
Blocks are linked together using cryptographic hashing (SHA-256), forming a secure chain. Any modification in a previous block invalidates all subsequent blocks, ensuring data integrity.
Order Matching (Off-Chain Optimization)
To maintain performance, trade matching is handled outside the blockchain layer. Once matched, the final transaction is recorded on-chain. This reflects real-world hybrid blockchain systems used in finance.
Immutable Ledger & Transparency
The blockchain acts as a tamper-evident ledger where all confirmed transactions are permanently recorded and can be audited.
▶️ Running the Project

Follow these steps to set up and run BlockTrade locally:

1. Clone the Repository
git clone https://github.com/Dishabh13/BlockTrade.git
cd BlockTrade
2. Set Up Virtual Environment
python -m venv venv

Activate it:

# Windows
venv\Scripts\activate

# Linux / Mac
source venv/bin/activate
3. Install Dependencies
pip install -r requirements.txt
4. Run the Application
python app.py
5. Access the App

Open your browser and go to:

http://127.0.0.1:5000/
🧪 What You Can Try
Execute buy/sell trades and observe how transactions are processed
Track how blocks are formed and linked
Explore how balance updates and validation work
Modify the code to experiment with different blockchain or trading logic
⚠️ Note

This project is a simulation, not a production-ready blockchain system. It is designed to demonstrate core concepts like:

Transaction validation
Block creation and chaining
Data immutability
Hybrid on-chain/off-chain architecture
