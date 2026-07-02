#!/usr/bin/env python3
"""
Trading Dashboard Backend API Testing Suite
Tests all API endpoints for the trading dashboard application.
"""

import requests
import sys
import json
from datetime import datetime
from typing import Dict, Any, Optional

class TradingDashboardTester:
    def __init__(self, base_url: str = "https://tradeview-26.preview.emergentagent.com/api"):
        self.base_url = base_url
        self.token = None
        self.user_id = None
        self.tests_run = 0
        self.tests_passed = 0
        self.test_results = []

    def log_test(self, name: str, success: bool, details: str = "", response_data: Any = None):
        """Log test result"""
        self.tests_run += 1
        if success:
            self.tests_passed += 1
        
        result = {
            "test": name,
            "success": success,
            "details": details,
            "response_data": response_data
        }
        self.test_results.append(result)
        
        status = "✅ PASS" if success else "❌ FAIL"
        print(f"{status} - {name}")
        if details:
            print(f"    {details}")

    def run_test(self, name: str, method: str, endpoint: str, expected_status: int, 
                 data: Optional[Dict] = None, params: Optional[Dict] = None) -> tuple[bool, Dict]:
        """Run a single API test"""
        url = f"{self.base_url}/{endpoint.lstrip('/')}"
        headers = {'Content-Type': 'application/json'}
        
        if self.token:
            headers['Authorization'] = f'Bearer {self.token}'

        try:
            if method == 'GET':
                response = requests.get(url, headers=headers, params=params, timeout=30)
            elif method == 'POST':
                response = requests.post(url, json=data, headers=headers, params=params, timeout=30)
            elif method == 'PUT':
                response = requests.put(url, json=data, headers=headers, params=params, timeout=30)
            elif method == 'DELETE':
                response = requests.delete(url, headers=headers, params=params, timeout=30)
            else:
                raise ValueError(f"Unsupported method: {method}")

            success = response.status_code == expected_status
            response_data = {}
            
            try:
                response_data = response.json()
            except:
                response_data = {"raw_response": response.text}

            details = f"Status: {response.status_code} (expected {expected_status})"
            if not success and response_data:
                details += f" - {response_data.get('detail', 'No error details')}"

            self.log_test(name, success, details, response_data)
            return success, response_data

        except Exception as e:
            self.log_test(name, False, f"Exception: {str(e)}")
            return False, {}

    def test_auth_register(self) -> bool:
        """Test user registration"""
        timestamp = datetime.now().strftime("%H%M%S")
        test_user = {
            "email": f"test_user_{timestamp}@example.com",
            "password": "TestPass123!",
            "name": f"Test User {timestamp}"
        }
        
        success, response = self.run_test(
            "User Registration",
            "POST",
            "/auth/register",
            200,
            data=test_user
        )
        
        if success and 'access_token' in response:
            self.token = response['access_token']
            self.user_id = response['user']['id']
            return True
        return False

    def test_auth_login(self) -> bool:
        """Test user login with existing credentials"""
        # Try to login with demo credentials first
        login_data = {
            "email": "demo@example.com",
            "password": "demo123"
        }
        
        success, response = self.run_test(
            "User Login (Demo)",
            "POST",
            "/auth/login",
            200,
            data=login_data
        )
        
        if success and 'access_token' in response:
            self.token = response['access_token']
            self.user_id = response['user']['id']
            return True
        
        # If demo login fails, create new user and login
        if self.test_auth_register():
            return True
        
        return False

    def test_auth_me(self) -> bool:
        """Test get current user"""
        success, response = self.run_test(
            "Get Current User",
            "GET",
            "/auth/me",
            200
        )
        return success

    def test_get_symbols(self) -> bool:
        """Test get available symbols"""
        success, response = self.run_test(
            "Get Available Symbols",
            "GET",
            "/symbols",
            200
        )
        
        if success and 'symbols' in response:
            symbols = response['symbols']
            if len(symbols) > 0 and 'symbol' in symbols[0]:
                self.log_test("Symbols Data Validation", True, f"Found {len(symbols)} symbols")
                return True
            else:
                self.log_test("Symbols Data Validation", False, "Invalid symbols format")
        
        return success

    def test_stock_data(self) -> bool:
        """Test stock data retrieval"""
        success, response = self.run_test(
            "Get Stock Data (AAPL)",
            "GET",
            "/stocks/AAPL",
            200,
            params={"interval": "daily"}
        )
        
        if success and 'candles' in response:
            candles = response['candles']
            if len(candles) > 0:
                candle = candles[0]
                required_fields = ['time', 'open', 'high', 'low', 'close', 'volume']
                if all(field in candle for field in required_fields):
                    self.log_test("Stock Data Validation", True, f"Found {len(candles)} candles with all required fields")
                    return True
                else:
                    self.log_test("Stock Data Validation", False, "Missing required candle fields")
            else:
                self.log_test("Stock Data Validation", False, "No candles data")
        
        return success

    def test_stock_indicators(self) -> bool:
        """Test stock data with custom indicators"""
        params = {
            "fast_ema": 20,
            "mid_ema": 50,
            "slow_ema": 200,
            "interval": "daily"
        }
        
        success, response = self.run_test(
            "Get Stock Indicators (AAPL)",
            "GET",
            "/stocks/AAPL/indicators",
            200,
            params=params
        )
        
        if success and 'candles' in response:
            candles = response['candles']
            if len(candles) > 0:
                # Check if indicators are present
                candle = candles[-1]  # Check last candle
                indicator_fields = ['fast_ema', 'mid_ema', 'slow_ema', 'cci', 'macd_histogram']
                present_indicators = [field for field in indicator_fields if field in candle and candle[field] is not None]
                
                if len(present_indicators) >= 3:  # At least 3 indicators should be present
                    self.log_test("Indicators Validation", True, f"Found indicators: {present_indicators}")
                    return True
                else:
                    self.log_test("Indicators Validation", False, f"Missing indicators. Found: {present_indicators}")
        
        return success

    def test_paper_trades_create(self) -> str:
        """Test creating paper trade"""
        success, response = self.run_test(
            "Create Paper Trade (Long AAPL)",
            "POST",
            "/paper-trades",
            200,
            params={
                "symbol": "AAPL",
                "position_type": "long",
                "quantity": 10
            }
        )
        
        if success and 'id' in response:
            trade_id = response['id']
            self.log_test("Paper Trade Creation Validation", True, f"Created trade with ID: {trade_id}")
            return trade_id
        
        return None

    def test_paper_trades_get(self) -> bool:
        """Test getting paper trades"""
        success, response = self.run_test(
            "Get Paper Trades",
            "GET",
            "/paper-trades",
            200,
            params={"status": "open"}
        )
        
        if success and 'trades' in response:
            trades = response['trades']
            self.log_test("Paper Trades Retrieval", True, f"Found {len(trades)} trades")
            return True
        
        return success

    def test_paper_trades_close(self, trade_id: str) -> bool:
        """Test closing paper trade"""
        if not trade_id:
            self.log_test("Close Paper Trade", False, "No trade ID provided")
            return False
        
        success, response = self.run_test(
            "Close Paper Trade",
            "PUT",
            f"/paper-trades/{trade_id}/close",
            200,
            params={"exit_reason": "manual"}
        )
        
        if success and 'profit_loss' in response:
            pnl = response['profit_loss']
            self.log_test("Paper Trade Close Validation", True, f"Trade closed with P/L: {pnl}")
            return True
        
        return success

    def test_backtest(self) -> bool:
        """Test backtesting functionality"""
        backtest_data = {
            "symbol": "AAPL",
            "fast_ema_range": [10, 15],
            "mid_ema_range": [30, 40],
            "slow_ema_range": [100, 150],
            "initial_capital": 10000.0
        }
        
        success, response = self.run_test(
            "Run Backtest",
            "POST",
            "/backtest",
            200,
            data=backtest_data
        )
        
        if success and 'results' in response:
            results = response['results']
            if len(results) > 0:
                result = results[0]
                required_fields = ['fast_ema', 'mid_ema', 'slow_ema', 'total_return', 'win_rate', 'total_trades']
                if all(field in result for field in required_fields):
                    self.log_test("Backtest Results Validation", True, f"Found {len(results)} backtest results")
                    return True
                else:
                    self.log_test("Backtest Results Validation", False, "Missing required result fields")
            else:
                self.log_test("Backtest Results Validation", False, "No backtest results")
        
        return success

    def test_settings_get(self) -> bool:
        """Test getting user settings"""
        success, response = self.run_test(
            "Get User Settings",
            "GET",
            "/settings",
            200
        )
        
        if success:
            required_fields = ['fast_ema', 'mid_ema', 'slow_ema', 'strategy_enabled']
            if all(field in response for field in required_fields):
                self.log_test("Settings Validation", True, "All required settings fields present")
                return True
            else:
                self.log_test("Settings Validation", False, "Missing required settings fields")
        
        return success

    def test_settings_update(self) -> bool:
        """Test updating user settings"""
        settings_data = {
            "fast_ema": 25,
            "mid_ema": 55,
            "slow_ema": 205,
            "strategy_enabled": True
        }
        
        success, response = self.run_test(
            "Update User Settings",
            "PUT",
            "/settings",
            200,
            data=settings_data
        )
        
        if success and 'settings' in response:
            updated_settings = response['settings']
            if updated_settings['fast_ema'] == 25 and updated_settings['strategy_enabled'] == True:
                self.log_test("Settings Update Validation", True, "Settings updated correctly")
                return True
            else:
                self.log_test("Settings Update Validation", False, "Settings not updated correctly")
        
        return success

    def run_all_tests(self) -> Dict[str, Any]:
        """Run all backend tests"""
        print("🚀 Starting Trading Dashboard Backend API Tests")
        print(f"📡 Testing against: {self.base_url}")
        print("=" * 60)

        # Authentication Tests
        print("\n🔐 Authentication Tests")
        if not self.test_auth_login():
            print("❌ Authentication failed - stopping tests")
            return self.get_summary()

        self.test_auth_me()

        # Stock Data Tests
        print("\n📈 Stock Data Tests")
        self.test_get_symbols()
        self.test_stock_data()
        self.test_stock_indicators()

        # Paper Trading Tests
        print("\n💰 Paper Trading Tests")
        trade_id = self.test_paper_trades_create()
        self.test_paper_trades_get()
        if trade_id:
            self.test_paper_trades_close(trade_id)

        # Backtesting Tests
        print("\n🧪 Backtesting Tests")
        self.test_backtest()

        # Settings Tests
        print("\n⚙️ Settings Tests")
        self.test_settings_get()
        self.test_settings_update()

        return self.get_summary()

    def get_summary(self) -> Dict[str, Any]:
        """Get test summary"""
        success_rate = (self.tests_passed / self.tests_run * 100) if self.tests_run > 0 else 0
        
        print("\n" + "=" * 60)
        print("📊 TEST SUMMARY")
        print(f"✅ Passed: {self.tests_passed}/{self.tests_run} ({success_rate:.1f}%)")
        
        failed_tests = [test for test in self.test_results if not test['success']]
        if failed_tests:
            print(f"❌ Failed Tests:")
            for test in failed_tests:
                print(f"   - {test['test']}: {test['details']}")

        return {
            "total_tests": self.tests_run,
            "passed_tests": self.tests_passed,
            "success_rate": success_rate,
            "failed_tests": failed_tests,
            "all_results": self.test_results
        }

def main():
    """Main test runner"""
    tester = TradingDashboardTester()
    summary = tester.run_all_tests()
    
    # Return appropriate exit code
    return 0 if summary["success_rate"] >= 80 else 1

if __name__ == "__main__":
    sys.exit(main())