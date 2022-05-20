import jsonLogic from "json-logic-js";
import React, { useState, useRef, useCallback, useEffect } from "react";
import { Query, Builder, Utils as QbUtils } from "react-awesome-query-builder";
// types
import { JsonGroup, Config, ImmutableTree, BuilderProps } from "react-awesome-query-builder";

import { Button } from "@calcom/ui";
import { Label } from "@calcom/ui/form/fields";
import { trpc } from "@calcom/web/lib/trpc";

import Select from "@components/ui/form/Select";

import RoutingShell from "../components/RoutingShell";
// @ts-ignore
import CalConfig from "../components/react-awesome-query-builder/config/config";

const InitialConfig = CalConfig as Config;

const fields = {};

// You need to provide your own config. See below 'Config format'
const config: Config = {
  ...InitialConfig,
  fields: fields,
};

export const QueryBuilderConfig = config;
const getEmptyRoute = (): SerializableRoute => {
  const uuid = QbUtils.uuid();
  return {
    id: uuid,
    action: {
      type: null,
      value: "",
    },
    queryValue: { id: uuid, type: "group" },
  };
};

export const getStoredRoutes = () => {
  if (typeof window !== "undefined") {
    const storedRoutes = localStorage.getItem("routes") || "[]";
    return JSON.parse(storedRoutes) as SerializableRoute[];
  }
  return [getEmptyRoute()];
};

export const getRoutingFormRoutes = () => {
  return getStoredRoutes();
};

const setStoredRoutes = (routes: Route[]) => {
  const serializedRoutes: SerializableRoute[] = routes.map((route) => ({
    id: route.id,
    action: route.action,
    queryValue: route.queryValue,
  }));
  localStorage.setItem("routes", JSON.stringify(serializedRoutes));
};

type Route = {
  id: string;
  action: {
    type: "customPageMessage" | "externalRedirectUrl" | "eventTypeRedirectUrl";
    value: string;
  };
  // This is what's persisted
  queryValue: JsonGroup;
  // `queryValue` is parsed to create state
  state: {
    tree: ImmutableTree;
    config: Config;
  };
};

type SerializableRoute = Pick<Route, "id" | "action" | "queryValue">;

const RouteBuilder: React.FC = ({ subPage: formId }) => {
  const { data: form, isLoading } = trpc.useQuery([
    "viewer.app_routing-forms.form",
    {
      id: +formId,
    },
  ]);

  const [dataToEvaluate, setData] = useState(`{ "companySize": "1-10", "color": "green" }`);
  let parsedDataToEvaluate: Record<string, string>;
  try {
    parsedDataToEvaluate = JSON.parse(dataToEvaluate);
  } catch (e) {
    parsedDataToEvaluate = {};
  }

  // TODO: Add persistence
  const [routes, setRoutes] = useState<Route[]>(
    getStoredRoutes().map((route) => ({
      ...route,
      state: {
        tree: QbUtils.checkTree(QbUtils.loadTree(route.queryValue), config),
        config: config,
      },
    }))
  );

  const setRoute = (id: string, route: Partial<Route>) => {
    setRoutes((routes: Route[]) => {
      const index = routes.findIndex((route) => route.id === id);
      const newRoutes = [...routes];
      newRoutes[index] = { ...routes[index], ...route };
      setStoredRoutes(newRoutes);
      return newRoutes;
    });
  };

  const onChange = useCallback((route, immutableTree: ImmutableTree, config: Config) => {
    const jsonTree = QbUtils.getTree(immutableTree);
    setRoute(route.id, {
      state: { tree: immutableTree, config: config },
      queryValue: jsonTree,
    });
  }, []);

  const renderBuilder = useCallback(
    (props: BuilderProps) => (
      <div className="query-builder-container">
        <div className="query-builder qb-lite">
          <Builder {...props} />
        </div>
      </div>
    ),
    []
  );

  if (!form) {
    return null;
  }
  if (!form.fields) {
    form.fields = [];
  }

  form.fields.forEach((question) => {
    if (question.type === "text") {
      fields[question.id] = {
        label: question.text,
        type: question.type,
        valueSources: ["value"],
      };
    } else {
      throw new Error("Unsupported question type");
    }
  });
  const RoutingPages = [
    {
      label: "Custom Page",
      value: "customPageMessage",
    },
    {
      label: "External Redirect",
      value: "externalRedirectUrl",
    },
    {
      label: "Event Redirect",
      value: "eventTypeRedirectUrl",
    },
  ];
  return (
    <RoutingShell formId={formId}>
      <div className="flex">
        {/* <textarea
          className="mr-10 w-1/4"
          value={dataToEvaluate}
          onChange={(e) => {
            setData(e.target.value);
          }}></textarea> */}
        <div className="route-config">
          <div className="cal-query-builder mr-10">
            {routes.map((route, key) => {
              const jsonLogicQuery = QbUtils.jsonLogicFormat(route.state.tree, route.state.config);
              const logic = jsonLogicQuery.logic;
              let result;
              if (logic) {
                result = jsonLogic.apply(logic as any, parsedDataToEvaluate);
              }
              return (
                <div key={key}>
                  {key !== 0 ? <hr className="my-4" /> : null}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center">
                      <Label className="text-lg">Go to</Label>
                      <Select
                        className="ml-10"
                        value={RoutingPages.find((page) => page.value === route.action.type)}
                        onChange={(item) => {
                          if (!item) {
                            return;
                          }
                          const action = {
                            type: item.value,
                          };

                          if (action.type === "customPageMessage") {
                            action.value = "We are not ready for you yet :(";
                          } else {
                            action.value = "";
                          }

                          setRoute(route.id, { action });
                        }}
                        options={RoutingPages}></Select>

                      {route.action.type ? (
                        route.action.type === "customPageMessage" ? (
                          <textarea
                            value={route.action.value}
                            onChange={(e) => {
                              setRoute(route.id, { action: { ...route.action, value: e.target.value } });
                            }}></textarea>
                        ) : (
                          <input
                            type="text"
                            value={route.action.value}
                            onChange={(e) => {
                              setRoute(route.id, { action: { ...route.action, value: e.target.value } });
                            }}
                            placeholder={
                              route.action.type === "eventTypeRedirectUrl"
                                ? "Enter Cal Link"
                                : "Enter External Redirect URL"
                            }></input>
                        )
                      ) : null}

                      <div className="ml-10 text-xl italic">IF</div>
                    </div>
                    <Button
                      onClick={() => {
                        setRoutes((routes) => {
                          const newRoutes = routes.filter((r) => r.id !== route.id);
                          setStoredRoutes(newRoutes);
                          return newRoutes;
                        });
                      }}>
                      Delete Route
                    </Button>
                  </div>
                  <Query
                    {...config}
                    value={route.state.tree}
                    onChange={(immutableTree, config) => {
                      onChange(route, immutableTree, config);
                    }}
                    renderBuilder={renderBuilder}
                  />
                  <div className="query-builder-result">
                    <div>Route: {JSON.stringify({ action: route.action, jsonLogicQuery })}</div>
                    <div>{result?.toString()}</div>
                  </div>
                </div>
              );
            })}
            <Button
              onClick={() => {
                const newEmptyRoute = getEmptyRoute();
                setRoutes((routes) => {
                  const newRoutes = [
                    ...routes,
                    {
                      ...newEmptyRoute,
                      state: {
                        tree: QbUtils.checkTree(QbUtils.loadTree(newEmptyRoute.queryValue), config),
                        config,
                      },
                    },
                  ];
                  setStoredRoutes(newRoutes);
                  return newRoutes;
                });
              }}>
              Add New Route
            </Button>
          </div>
        </div>
      </div>
    </RoutingShell>
  );
};

if (typeof window !== "undefined") {
  window.jsonLogic = jsonLogic;
}

export default RouteBuilder;
