Component({
  properties: {
    show: { type: Boolean, value: false },
    title: { type: String, value: '' },
    subtitle: { type: String, value: '' },
    kind: { type: String, value: 'rank' }
  },
  methods: {
    onClose() {
      this.triggerEvent('close');
    }
  }
});
