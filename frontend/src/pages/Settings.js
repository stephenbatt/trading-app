import React, { useState, useEffect } from 'react';
import { settings as settingsApi } from '../lib/api';
import Layout from '../components/Layout';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Switch } from '../components/ui/switch';
import { Slider } from '../components/ui/slider';
import { Skeleton } from '../components/ui/skeleton';
import { 
  Settings as SettingsIcon, 
  Save,
  Loader2,
  Activity,
  AlertCircle
} from 'lucide-react';
import { toast } from 'sonner';

const Settings = () => {
  const [settings, setSettings] = useState({
    fast_ema: 20,
    mid_ema: 50,
    slow_ema: 200,
    strategy_enabled: false,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [originalSettings, setOriginalSettings] = useState(null);

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const response = await settingsApi.get();
        setSettings(response.data);
        setOriginalSettings(response.data);
      } catch (error) {
        toast.error('Failed to load settings');
      } finally {
        setLoading(false);
      }
    };
    fetchSettings();
  }, []);

  useEffect(() => {
    if (originalSettings) {
      const changed = JSON.stringify(settings) !== JSON.stringify(originalSettings);
      setHasChanges(changed);
    }
  }, [settings, originalSettings]);

  const handleSave = async () => {
    // Validate EMA periods
    if (settings.fast_ema >= settings.mid_ema) {
      toast.error('Fast EMA must be less than Mid EMA');
      return;
    }
    if (settings.mid_ema >= settings.slow_ema) {
      toast.error('Mid EMA must be less than Slow EMA');
      return;
    }

    setSaving(true);
    try {
      await settingsApi.update(settings);
      setOriginalSettings(settings);
      setHasChanges(false);
      toast.success('Settings saved successfully');
    } catch (error) {
      toast.error('Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    setSettings({
      fast_ema: 20,
      mid_ema: 50,
      slow_ema: 200,
      strategy_enabled: false,
    });
  };

  if (loading) {
    return (
      <Layout>
        <div className="p-4 space-y-6">
          <Skeleton className="h-12 w-48" />
          <Skeleton className="h-64 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="p-4 space-y-6 max-w-2xl">
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-zinc-700/50 border border-zinc-600">
            <SettingsIcon className="h-6 w-6 text-zinc-300" />
          </div>
          <div>
            <h1 className="font-heading text-2xl font-bold text-white">Settings</h1>
            <p className="text-sm text-zinc-400">Configure your default trading parameters</p>
          </div>
        </div>

        {/* EMA Settings */}
        <Card className="bg-zinc-900 border-zinc-800">
          <CardHeader>
            <CardTitle className="text-lg text-white flex items-center gap-2">
              <Activity className="h-5 w-5 text-zinc-400" />
              Default EMA Periods
            </CardTitle>
            <CardDescription className="text-zinc-500">
              These values will be used as defaults when loading charts
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-8">
            {/* Fast EMA */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-amber-500">Fast EMA</Label>
                  <p className="text-xs text-zinc-500 mt-1">Quick trend changes (5-50)</p>
                </div>
                <Input
                  type="number"
                  value={settings.fast_ema}
                  onChange={(e) => setSettings(prev => ({ ...prev, fast_ema: parseInt(e.target.value) || 5 }))}
                  className="w-20 bg-zinc-800 border-zinc-700 font-mono text-center"
                  min={5}
                  max={50}
                  data-testid="settings-fast-ema"
                />
              </div>
              <Slider
                value={[settings.fast_ema]}
                onValueChange={([value]) => setSettings(prev => ({ ...prev, fast_ema: value }))}
                min={5}
                max={50}
                step={1}
                className="[&_[role=slider]]:bg-amber-500"
              />
            </div>

            {/* Mid EMA */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-purple-500">Mid EMA</Label>
                  <p className="text-xs text-zinc-500 mt-1">Medium-term trend (20-100)</p>
                </div>
                <Input
                  type="number"
                  value={settings.mid_ema}
                  onChange={(e) => setSettings(prev => ({ ...prev, mid_ema: parseInt(e.target.value) || 20 }))}
                  className="w-20 bg-zinc-800 border-zinc-700 font-mono text-center"
                  min={20}
                  max={100}
                  data-testid="settings-mid-ema"
                />
              </div>
              <Slider
                value={[settings.mid_ema]}
                onValueChange={([value]) => setSettings(prev => ({ ...prev, mid_ema: value }))}
                min={20}
                max={100}
                step={1}
                className="[&_[role=slider]]:bg-purple-500"
              />
            </div>

            {/* Slow EMA */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-pink-500">Slow EMA (Trailing Stop)</Label>
                  <p className="text-xs text-zinc-500 mt-1">Long-term trend & stop-loss (50-300)</p>
                </div>
                <Input
                  type="number"
                  value={settings.slow_ema}
                  onChange={(e) => setSettings(prev => ({ ...prev, slow_ema: parseInt(e.target.value) || 50 }))}
                  className="w-20 bg-zinc-800 border-zinc-700 font-mono text-center"
                  min={50}
                  max={300}
                  data-testid="settings-slow-ema"
                />
              </div>
              <Slider
                value={[settings.slow_ema]}
                onValueChange={([value]) => setSettings(prev => ({ ...prev, slow_ema: value }))}
                min={50}
                max={300}
                step={5}
                className="[&_[role=slider]]:bg-pink-500"
              />
            </div>

            {/* Validation Warning */}
            {(settings.fast_ema >= settings.mid_ema || settings.mid_ema >= settings.slow_ema) && (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/30">
                <AlertCircle className="h-4 w-4 text-red-400 flex-shrink-0" />
                <span className="text-sm text-red-400">
                  EMA periods must be in order: Fast &lt; Mid &lt; Slow
                </span>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Strategy Settings */}
        <Card className="bg-zinc-900 border-zinc-800">
          <CardHeader>
            <CardTitle className="text-lg text-white">Strategy Execution</CardTitle>
            <CardDescription className="text-zinc-500">
              Control automated strategy signals
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between p-4 rounded-lg bg-zinc-800 border border-zinc-700">
              <div>
                <Label className="text-white">Enable Strategy Execution</Label>
                <p className="text-xs text-zinc-500 mt-1">
                  When enabled, signals will be generated based on EMA crossovers
                </p>
              </div>
              <Switch
                checked={settings.strategy_enabled}
                onCheckedChange={(checked) => setSettings(prev => ({ ...prev, strategy_enabled: checked }))}
                data-testid="settings-strategy-toggle"
              />
            </div>
          </CardContent>
        </Card>

        {/* Save Button */}
        <div className="flex gap-3">
          <Button
            onClick={handleSave}
            disabled={!hasChanges || saving}
            className="flex-1 bg-green-600 hover:bg-green-700 text-white btn-interactive"
            data-testid="save-settings-button"
          >
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Saving...
              </>
            ) : (
              <>
                <Save className="h-4 w-4 mr-2" />
                Save Settings
              </>
            )}
          </Button>

          <Button
            variant="outline"
            onClick={handleReset}
            className="border-zinc-700 text-zinc-400 hover:text-white"
            data-testid="reset-settings-button"
          >
            Reset to Defaults
          </Button>
        </div>

        {/* Info Section */}
        <Card className="bg-zinc-900/50 border-zinc-800">
          <CardContent className="p-4">
            <h3 className="text-sm font-medium text-zinc-400 mb-3">About EMA Settings</h3>
            <ul className="space-y-2 text-xs text-zinc-500">
              <li>• <strong className="text-amber-500">Fast EMA</strong> - Reacts quickly to price changes. Used for entry signals.</li>
              <li>• <strong className="text-purple-500">Mid EMA</strong> - Provides medium-term trend direction.</li>
              <li>• <strong className="text-pink-500">Slow EMA</strong> - Acts as dynamic trailing stop-loss. Price breaking this level triggers exits.</li>
              <li className="pt-2 text-zinc-400">
                Tip: Use the Backtester to find optimal EMA combinations for different symbols.
              </li>
            </ul>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
};

export default Settings;
