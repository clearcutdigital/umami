'use client';
import { Column } from '@umami/react-zen';
import { PageBody } from '@/components/common/PageBody';
import { PageHeader } from '@/components/common/PageHeader';
import { Panel } from '@/components/common/Panel';
import { useLoginQuery, useMessages } from '@/components/hooks';
import { EmailSettings } from '../email/EmailSettings';
import { PreferenceSettings } from './PreferenceSettings';

export function PreferencesPage() {
  const { user } = useLoginQuery();
  const { t, labels } = useMessages();

  return (
    <PageBody>
      <Column gap="6">
        <PageHeader title={t(labels.preferences)} />
        <Panel>
          <PreferenceSettings />
        </Panel>
        {user?.isAdmin && (
          <Panel>
            <EmailSettings />
          </Panel>
        )}
      </Column>
    </PageBody>
  );
}
