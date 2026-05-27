const QUESTIONS = {
  WORK: [
    {
      id: 'did_work',
      text: '今日は仕事をした？',
      type: 'yn',
    },
    {
      id: 'work_content',
      text: 'どんな仕事をした？',
      type: 'textarea',
      showIf: { id: 'did_work', value: 'y' },
    },
    {
      id: 'work_learning',
      text: 'その仕事で学んだこと',
      type: 'textarea',
      showIf: { id: 'did_work', value: 'y' },
    },
    {
      id: 'got_order',
      text: '今日は受注した？',
      type: 'yn',
    },
    {
      id: 'client_name',
      text: 'お客様の名前は？',
      type: 'text',
      showIf: { id: 'got_order', value: 'y' },
    },
    {
      id: 'order_content',
      text: '仕事内容は？',
      type: 'textarea',
      showIf: { id: 'got_order', value: 'y' },
    },
    {
      id: 'tomorrow_plan',
      text: '明日の仕事の予定は？',
      type: 'textarea',
    },
    {
      id: 'other',
      text: 'その他',
      type: 'textarea',
    },
  ],
};

module.exports = QUESTIONS;
