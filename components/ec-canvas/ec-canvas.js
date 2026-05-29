const chartUtil = require('../../utils/chart.js');

Component({
  properties: {
    canvasId: { type: String, value: 'ec-canvas' },
    option: { type: Object, value: null }
  },
  observers: {
    option: function (opt) {
      if (opt && this.ctx) this.render(opt);
    }
  },
  lifetimes: {
    ready() {
      this.init();
    }
  },
  methods: {
    init() {
      const that = this;
      const query = this.createSelectorQuery();
      query
        .select('#' + this.data.canvasId)
        .fields({ node: true, size: true })
        .exec(function (res) {
          if (!res || !res[0] || !res[0].node) return;
          const canvas = res[0].node;
          const ctx = canvas.getContext('2d');
          const dpr =
            (wx.getWindowInfo && wx.getWindowInfo().pixelRatio) ||
            (wx.getSystemInfoSync && wx.getSystemInfoSync().pixelRatio) ||
            2;
          const width = res[0].width;
          const height = res[0].height;
          canvas.width = width * dpr;
          canvas.height = height * dpr;
          ctx.scale(dpr, dpr);
          that.canvas = canvas;
          that.ctx = ctx;
          that.width = width;
          that.height = height;
          if (that.properties.option) that.render(that.properties.option);
        });
    },
    render(option) {
      chartUtil.draw(this.ctx, option, this.width, this.height);
    }
  }
});
