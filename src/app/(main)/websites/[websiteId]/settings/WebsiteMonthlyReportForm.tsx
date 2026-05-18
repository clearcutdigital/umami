'use client';

import {
  Button,
  Column,
  Form,
  FormButtons,
  FormField,
  FormSubmitButton,
  Label,
  Row,
  Switch,
  TextField,
} from '@umami/react-zen';
import { useEffect, useState } from 'react';
import { useApi, useMessages, useUpdateQuery } from '@/components/hooks';

export function WebsiteMonthlyReportForm({ websiteId }: { websiteId: string }) {
  const [enabled, setEnabled] = useState(false);
  const { get, useQuery } = useApi();
  const { t, labels, messages, getErrorMessage } = useMessages();
  const saveQuery = useUpdateQuery(`/websites/${websiteId}/monthly-report`);
  const sendQuery = useUpdateQuery(`/websites/${websiteId}/monthly-report/send`);
  const { data } = useQuery({
    queryKey: ['website-monthly-report', websiteId],
    queryFn: async () => get(`/websites/${websiteId}/monthly-report`),
  });

  useEffect(() => {
    setEnabled(data?.enabled ?? false);
  }, [data?.enabled]);

  const handleSubmit = async (values: any) => {
    await saveQuery.mutateAsync(
      { ...values, enabled },
      {
        onSuccess: async () => {
          saveQuery.toast(t(messages.saved));
        },
      },
    );
  };

  const handleSend = async () => {
    await sendQuery.mutateAsync(
      {},
      {
        onSuccess: async () => {
          sendQuery.toast('Monthly report sent successfully.');
        },
      },
    );
  };

  return (
    <Form
      onSubmit={handleSubmit}
      error={getErrorMessage(saveQuery.error || sendQuery.error)}
      values={data}
    >
      <Column gap="5">
        <Switch isSelected={enabled} onChange={setEnabled}>
          Enable monthly reports
        </Switch>
        <FormField
          label="Recipients"
          name="recipients"
          rules={{
            validate: value => {
              if (!value?.trim() && enabled) {
                return t(labels.required);
              }

              return true;
            },
          }}
        >
          {({ field }) => (
            <textarea
              {...field}
              rows={4}
              style={{
                width: '100%',
                minHeight: 96,
                resize: 'vertical',
                padding: '10px 12px',
                border: '1px solid var(--base-color-5)',
                borderRadius: 8,
                background: 'var(--base-color-1)',
                color: 'var(--font-color)',
                boxSizing: 'border-box',
                font: 'inherit',
              }}
            />
          )}
        </FormField>
        {data?.lastSentAt && (
          <Column>
            <Label>Last sent</Label>
            {new Date(data.lastSentAt).toLocaleString()}
          </Column>
        )}
        <FormButtons>
          <Row gap>
            <Button onPress={handleSend} isDisabled={sendQuery.isPending}>
              Send now
            </Button>
            <FormSubmitButton variant="primary" isDisabled={saveQuery.isPending}>
              {t(labels.save)}
            </FormSubmitButton>
          </Row>
        </FormButtons>
      </Column>
    </Form>
  );
}
