const express = require("express");
const morgan = require("morgan");
const cors = require("cors");
const path = require("path");
const killPort = require("kill-port");

const { ethers } = require("ethers");

require("dotenv").config();

const app = express();
const PORT = parseInt(process.env.PORT, 10) || 3001;

const checkPort = async (port, maxPort = 65535) => {
  if (port > maxPort) {
    throw new Error("No available ports found");
  }

  try {
    await killPort(port, "tcp");
    await killPort(port, "udp");
    return port;
  } catch (err) {
    return checkPort(port + 1, maxPort);
  }
};

(async () => {
  const safePort = await checkPort(PORT);
  const getPort = (await import("get-port")).default; // dynamic import
  const final_port = await getPort({ port: safePort });

  console.log(`Port ${final_port} is free. Ready to start server.`);

  // Middleware
  app.use(cors({ origin: `http://localhost:${final_port}` }));
  app.use(express.json());
  app.use(morgan("dev"));

  // Routes
  app.use("/api/items", require("./routes/items"));
  app.use("/api/stats", require("./routes/stats"));

  require("./config/dbHandler.js").connect();

  /**
     * @route    GET /api/tevaApiTest
     * @desc     Fetches real-time Uniswap V2 WETH/USDC pool reserves and computes spot price
     * @author   Teva Andre
     * @access   public
     * @param    {Request}  req  - Express request object.
     * @param    {Response} res  - Express response object.
     * @returns  {JSON}     pool reserves, spot price and metadata
     * @throws   500 on RPC or contract failure
     *
     * @example
     * curl http://localhost:3001/api/tevaApiTest
     * {
         "pool": "Uniswap V2 WETH/USDC",
     *   "address": "0xB4e16d0168e52d35CaCD2c6185b44281Ec28C9Dc",
     *   "usdc_reserve": 9018893.176244,
     *   "weth_reserve": 4530.080015197829,
     *   "eth_price_usdc": 2500.00,
     *   "last_sync": 1772127851
     * }
     */
  app.get("/api/tevaApiTest", async (req, res) => {
    try {
      const provider = new ethers.JsonRpcProvider("https://eth.llamarpc.com");
      // Uniswap V2 WETH/USDC contract
      const POOL = "0xB4e16d0168e52d35CaCD2c6185b44281Ec28C9Dc";
      const ABI = [
        "function getReserves() view returns (uint112, uint112, uint32)",
      ];

      const pool = new ethers.Contract(POOL, ABI, provider);
      const [reserve0, reserve1, timestamp] = await pool.getReserves();

      const usdc = Number(reserve0) / 1e6;
      const weth = Number(reserve1) / 1e18;
      const price = usdc / weth;

      const result = {
        pool: "Uniswap V2 WETH/USDC",
        address: POOL,
        usdc_reserve: usdc,
        weth_reserve: weth,
        eth_price_usdc: Math.round(price * 100) / 100,
        last_sync: Number(timestamp),
      };
      console.log("Pool data fetched:", result);
      res.json(result);
    } catch (error) {
      console.error("❌ Error fetching pool data:", error.message);
      res.status(500).json({ error: error.message });
    }
  });

  // Serve static files in production
  if (process.env.NODE_ENV === "production") {
    app.use(express.static("client/build"));
    app.get("*", (req, res) => {
      res.sendFile(path.resolve(__dirname, "client", "build", "index.html"));
    });
  }

  // Start server
  app.listen(final_port, () => {
    console.log(`Backend running on http://localhost:${final_port}`);
  });
})();
