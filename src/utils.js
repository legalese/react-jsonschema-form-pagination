import deepcopy from "deepcopy";

export const GENERIC_TAB = "default";
export const UI_TAB_ID = "ui:tabID";

export function isDevelopment() {
  return process.env.NODE_ENV !== "production";
}

class Layer {
  constructor(tabs, uiSchema, conf) {
    this.tabs = tabs;
    this.uiSchema = uiSchema;
    this.conf = conf;
    this.defaultTab = { tabs, schema: conf[GENERIC_TAB], uiSchema };
    this.activeTab = this.chooseActive(tabs);
  }

  chooseActive(tabs) {
    let nonDefaultTabs = tabs.filter(({ tabID }) => tabID != GENERIC_TAB);
    return nonDefaultTabs.length > 0 ? nonDefaultTabs[0].tabID : GENERIC_TAB;
  }

  doUpdateActiveTabs = (activeTabs, i) => {
    if (i === activeTabs.length) {
      if (this.activeTab !== GENERIC_TAB) {
        activeTabs.push(this.activeTab);
        this.conf[this.activeTab].doUpdateActiveTabs(activeTabs, i + 1);
      }
    } else {
      this.activeTab = activeTabs[i];
      this.conf[activeTabs[i]].doUpdateActiveTabs(activeTabs, i + 1);
    }
    return activeTabs;
  };

  updateActiveTabs = activeTabs => this.doUpdateActiveTabs(activeTabs, 0);

  toSubForms = activeTabs => {
    let agg = [];
    let tab = activeTabs[0];
    agg.push(Object.assign({}, this.defaultTab, { activeTab: tab }));
    if (activeTabs.length === 0) {
      return agg;
    }
    if (tab !== GENERIC_TAB) {
      let nextConf = this.conf[tab];
      let nextTabs = activeTabs.slice(1);
      let nestedTabs = nextConf.toSubForms(nextTabs);
      nestedTabs.forEach(conf => agg.push(conf));
    }
    return agg;
  };
}

function findLayer(field, uiSchema) {
  return uiSchema && uiSchema[field] && uiSchema[field][UI_TAB_ID]
    ? uiSchema[field][UI_TAB_ID][0]
    : GENERIC_TAB;
}

function listLayers(schema, uiSchema) {
  let layers = Object.keys(schema.properties).map(field =>
    findLayer(field, uiSchema)
  );
  return Array.from(new Set(layers));
}

function removeLayerFromUi(uiSchema) {
  let cleanedUiSchema = deepcopy(uiSchema);
  Object.keys(cleanedUiSchema).forEach(field => {
    let uiTab = cleanedUiSchema[field][UI_TAB_ID];
    if (uiTab && uiTab.length > 1) {
      uiTab.shift();
    } else {
      delete cleanedUiSchema[field][UI_TAB_ID];
    }
  });
  return cleanedUiSchema;
}

function copyField(schema, field, origSchema) {
  if (origSchema.required.includes(field)) {
    schema.required.push(field);
  }
  schema.properties[field] = origSchema.properties[field];
}

function extractSchemaForLayer(layer, origSchema, uiSchema) {
  let schema = Object.assign({}, deepcopy(origSchema), {
    required: [],
    properties: {},
  });
  Object.keys(origSchema.properties)
    .filter(field => {
      let sameLayer = findLayer(field, uiSchema) === layer;
      return sameLayer;
    })
    .forEach(field => copyField(schema, field, origSchema));
  return schema;
}

function doSplitInLayers(origSchema, origUiSchema, tabData) {
  let layers = listLayers(origSchema, origUiSchema);
  let uiSchema = removeLayerFromUi(origUiSchema);

  let conf = layers.reduce((conf, layer) => {
    let schema = extractSchemaForLayer(layer, origSchema, origUiSchema);
    if (layer !== GENERIC_TAB) {
      conf[layer] = doSplitInLayers(schema, uiSchema, tabData);
    } else {
      conf[layer] = schema;
    }
    return conf;
  }, {});

  let tabs = layers.map(layer => {
    let tab = tabData.find(({ tabID }) => tabID === layer);
    return tab ? tab : { tabID: layer, name: layer };
  });

  return new Layer(tabs, uiSchema, conf);
}

function normalizeUiSchema(uiSchema) {
  let normUiSchema = deepcopy(uiSchema);
  Object.keys(normUiSchema).forEach(field => {
    if (
      normUiSchema[field] &&
      normUiSchema[field][UI_TAB_ID] &&
      !Array.isArray(normUiSchema[field][UI_TAB_ID])
    ) {
      normUiSchema[field][UI_TAB_ID] = [normUiSchema[field][UI_TAB_ID]];
    }
  });
  return normUiSchema;
}

function normalizeSchema(schema) {
  let normSchema = deepcopy(schema);
  if (!normSchema.required) {
    normSchema.required = [];
  }
  return normSchema;
}

export function splitInLayers(schema, uiSchema = {}, tabData) {
  return doSplitInLayers(
    normalizeSchema(schema),
    normalizeUiSchema(uiSchema),
    tabData
  );
}
