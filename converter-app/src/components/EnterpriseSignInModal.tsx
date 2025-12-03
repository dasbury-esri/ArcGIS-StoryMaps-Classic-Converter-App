import { useEffect, useRef, useState } from 'react';
import {
  CalciteDialog,
  CalciteLabel,
  CalciteInput,
  CalciteInputMessage,
  CalciteTabs,
  CalciteTabNav,
  CalciteTabTitle,
  CalciteTab,
  CalciteButton
} from '@esri/calcite-components-react';

interface Props {
  open: boolean;
  onCancel: () => void;
  onContinue: (portalUrl: string, appClientId?: string) => void;
}

export default function EnterpriseSignInModal({ open, onCancel, onContinue }: Props) {
  const [portalUrl, setPortalUrl] = useState('');
  const [clientId, setClientId] = useState('');
  const [invalidUrl, setInvalidUrl] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (open) {
      // Defer focus to avoid synchronous setState in effect
      setTimeout(() => {
        setInvalidUrl(false);
        inputRef.current?.focus();
      }, 0);
    }
  }, [open, setInvalidUrl]);

  const validateUrl = (value: string): boolean => {
    if (!value) return false;
    try {
      const u = new URL(value);
      return !!u.protocol && !!u.host;
    } catch {
      return false;
    }
  };

  const handleSubmit = () => {
    const ok = validateUrl(portalUrl);
    setInvalidUrl(!ok);
    if (!ok) return;
    onContinue(portalUrl.trim(), clientId.trim() || undefined);
  };

  return (
     
      <CalciteDialog
        open={open}
        heading="Sign in to ArcGIS Enterprise"
        onCalciteDialogClose={onCancel}
      >
      <div>
        <CalciteLabel>URL
          <CalciteInput
            ref={inputRef as unknown as React.RefObject<HTMLCalciteInputElement>}
            required
            id="enterprise_portal_url"
            name="enterprise_portal_url"
            placeholder="e.g. https://myportal.mydomain.com/portal"
            type="text"
            value={portalUrl}
            onCalciteInputChange={(e: any) => {
              const v = (e?.target as any)?.value ?? '';
              setPortalUrl(v);
            }}
          />
          <CalciteInputMessage status={invalidUrl ? 'invalid' : undefined}>Enter a valid organization url</CalciteInputMessage>
        </CalciteLabel>
        <CalciteTabs layout="inline">
            <CalciteTabNav slot="tab-nav">
              <CalciteTabTitle>OAuth Login</CalciteTabTitle>
          </CalciteTabNav>
            <CalciteTab style={{ width: '100%', marginTop: '1rem' }}>
            <CalciteLabel>App ID
              <CalciteInput
                id="enterprise_client_id"
                name="app_client_id"
                placeholder="e.g. aBcDeFgHi1j2K3L4"
                type="text"
                value={clientId}
                onCalciteInputChange={(e: any) => {
                  const v = (e?.target as any)?.value ?? '';
                  setClientId(v);
                }}
              />
                <CalciteInputMessage status="invalid">Enter a valid registered App ID</CalciteInputMessage>
            </CalciteLabel>
          </CalciteTab>
        </CalciteTabs>
        <details className="enterprise-details">
          <summary>More Details</summary>
          <p className="enterprise-details-text">
            In order to log in to a Portal for ArcGIS instance using a SAML-based Identity Provider, you will
            need to Register the Classic StoryMap Converter as an application in your Portal, and generate an AppID that can
            identify this app as an allowed client of the Portal. To do so, follow the instructions {' '}
            <a href="https://enterprise.arcgis.com/en/portal/latest/use/add-app-url.htm#REG_APP" target="_blank" rel="noopener">here</a>
            , using <strong>Other Application</strong> as the <em>Type of App</em> and
            <code className="enterprise-details-code">https://url-for-this-app.com/</code> 
            as the Redirect URI.
          </p>
        </details>
      </div>
      <div slot="footer">
        <CalciteButton color="blue" onClick={handleSubmit}>Continue</CalciteButton>
        <CalciteButton appearance="outline" color="blue" onClick={onCancel}>Cancel</CalciteButton>
      </div>
    </CalciteDialog>
  );
}
