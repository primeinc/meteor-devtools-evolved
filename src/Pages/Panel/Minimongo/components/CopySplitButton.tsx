// src/Pages/Panel/Minimongo/components/CopySplitButton.tsx
import React, { useEffect, useMemo, useState } from 'react';
import { Button, ButtonGroup, Menu, MenuItem } from '@blueprintjs/core';
import { Popover2 } from '@blueprintjs/popover2';
import { COPY_FORMATS, CopyFormatKey, generateByKey } from '@/Pages/Panel/Minimongo/services/CopyFormats';
import { copyText } from '@/Pages/Panel/Minimongo/services/ClipboardService';

const LS_KEY = 'mde.copy.lastFormat';

interface Props {
  collectionName: string;
  doc: Record<string, any>;
  initialFormat?: CopyFormatKey; // default 'raw'
}

export const CopySplitButton: React.FC<Props> = ({ collectionName, doc, initialFormat = 'raw' }) => {
  const [lastFormat, setLastFormat] = useState<CopyFormatKey>(initialFormat);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(LS_KEY) as CopyFormatKey | null;
      if (saved && COPY_FORMATS.some(f => f.key === saved)) setLastFormat(saved);
    } catch {}
  }, []);

  useEffect(() => { try { localStorage.setItem(LS_KEY, lastFormat); } catch {} }, [lastFormat]);

  const primaryLabel = useMemo(
    () => COPY_FORMATS.find(f => f.key === lastFormat)?.label || 'Copy',
    [lastFormat]
  );

  const onPrimary = async () => {
    const text = generateByKey(lastFormat, collectionName, doc);
    await copyText(primaryLabel, text);
  };

  const menu = (
    <Menu>
      {COPY_FORMATS.map(({ key, label, description }) => (
        <MenuItem
          key={key}
          text={label}
          labelElement={<span style={{ color: '#8A9BA8', fontSize: 11 }}>{description}</span>}
          onClick={async () => {
            const text = generateByKey(key, collectionName, doc);
            await copyText(label, text);
            setLastFormat(key);
          }}
        />
      ))}
    </Menu>
  );

  return (
    <ButtonGroup>
      <Button icon="clipboard" onClick={onPrimary}>{primaryLabel}</Button>
      <Popover2 content={menu} placement="top-end" minimal>
        <Button icon="caret-down" />
      </Popover2>
    </ButtonGroup>
  );
};
